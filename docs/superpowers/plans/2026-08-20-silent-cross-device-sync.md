# Silent Cross-Device Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add low-overhead, 60-second cross-device synchronization that updates only changed todo/document rows without page refreshes or loading-state flashes and protects active edits with optimistic concurrency.

**Architecture:** SQLite triggers maintain per-user revisions for todos, directories, and documents. A lightweight authenticated status endpoint gates full-list requests; a client coordinator checks while visible and on focus, then delegates immutable snapshots to todo/document stores that reconcile keyed DOM nodes. Writes use `updatedAt` as an optimistic concurrency token and expose explicit remote/overwrite conflict choices.

**Tech Stack:** Cloudflare Pages Functions, D1/SQLite migrations and triggers, browser ES modules and DOM APIs, Node.js built-in test runner.

## Global Constraints

- Foreground polling interval is exactly 60 seconds with up to 5 seconds of startup jitter.
- Hidden pages do not poll; becoming visible or focused requests one deduplicated immediate check.
- Background synchronization never clears existing content, displays an application loading state, changes the active Tab, scrolls the page, or steals focus.
- Business data is not persisted in `localStorage`, `sessionStorage`, or IndexedDB.
- No WebSocket, SSE, or new third-party dependency is introduced.
- Active local drafts are never overwritten by a background result.
- API responses remain `Cache-Control: no-store` and account scoped.

---

## File Structure

- Create `migrations/0005_silent_cross_device_sync.sql`: add todo update tokens, revision table, and revision triggers.
- Modify `schema.sql`: make fresh databases match migration 0005.
- Create `functions/_lib/data-revisions.js`: revision domain constants, zero defaults, row mapping, and D1 statements.
- Create `functions/api/sync-status.js`: authenticated lightweight revision endpoint.
- Modify `functions/api/d1.js`: return todo revisions, update tokens, and edit conflicts.
- Modify `functions/api/document-links.js`: return document revisions and enforce edit conflicts.
- Modify `functions/api/document-directories.js`: return directory revisions and enforce rename conflicts.
- Modify `tests/helpers/fake-document-db.js`: emulate revisions, todos, conditional writes, and batch rollback.
- Create `sync-coordinator.js`: visibility/focus/timer request orchestration only.
- Modify `d1-storage.js`: maintain todo revision/snapshot and surface conflicts.
- Create `todo-sync.js`: merge remote todo snapshots and reconcile keyed todo nodes without owning network timing.
- Modify `index.html`: use todo synchronization helpers and expose the todo sync lifecycle.
- Modify `document-links-state.js`: hold per-domain revisions and apply silent snapshots.
- Modify `document-links-ui.js`: keyed directory/document reconciliation and conflict UI.
- Modify `auth-ui.js`: start/stop prefetch and synchronization with authenticated lifecycle.
- Modify `feature-tabs.js`: switch panels only; document activation must not initiate loading.
- Modify `scripts/prepare-pages.mjs`: copy new browser modules into the deployment bundle.
- Modify `package.json`: syntax-check new modules and endpoints.
- Create or extend tests named in each task below.

---

### Task 1: Revision Schema and Atomic Triggers

**Files:**
- Create: `migrations/0005_silent_cross_device_sync.sql`
- Modify: `schema.sql`
- Create: `tests/silent-sync-schema.test.js`

**Interfaces:**
- Produces: table `user_data_revisions(user_id, todos_revision, directories_revision, documents_revision)`.
- Produces: `todos.updatedAt`, populated for every existing and new todo.
- Produces: nine AFTER triggers named `bump_<domain>_revision_after_<operation>`.

- [ ] **Step 1: Write failing schema tests**

Read both SQL files and assert that migration 0005 adds `updatedAt`, backfills it from `createdAt`, creates the revision table, and defines INSERT/UPDATE/DELETE triggers for all three domains. Assert `schema.sql` creates fresh todos with `updatedAt TEXT NOT NULL` and contains the same revision table and triggers.

```js
test('migration adds update tokens and all revision triggers', async () => {
  assert.match(migration, /ALTER TABLE todos\s+ADD COLUMN updatedAt TEXT/i);
  assert.match(migration, /UPDATE todos SET updatedAt = createdAt WHERE updatedAt IS NULL/i);
  for (const domain of ['todos', 'directories', 'documents']) {
    for (const operation of ['insert', 'update', 'delete']) {
      assert.match(migration, new RegExp(`bump_${domain}_revision_after_${operation}`, 'i'));
    }
  }
});
```

- [ ] **Step 2: Run the schema test and verify failure**

Run: `node --test tests/silent-sync-schema.test.js`

Expected: FAIL because migration 0005 does not exist.

- [ ] **Step 3: Add the migration and fresh-schema SQL**

Use this revision shape and trigger body for each operation/domain:

```sql
CREATE TABLE user_data_revisions (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  todos_revision INTEGER NOT NULL DEFAULT 0,
  directories_revision INTEGER NOT NULL DEFAULT 0,
  documents_revision INTEGER NOT NULL DEFAULT 0
);

CREATE TRIGGER bump_todos_revision_after_insert
AFTER INSERT ON todos
BEGIN
  INSERT INTO user_data_revisions (user_id, todos_revision)
  VALUES (NEW.user_id, 1)
  ON CONFLICT(user_id) DO UPDATE SET todos_revision = todos_revision + 1;
END;
```

Use `NEW.user_id` for INSERT/UPDATE and `OLD.user_id` for DELETE. Directory triggers update `directories_revision`; document triggers update `documents_revision`. In the migration, add nullable `updatedAt`, backfill it, and let application writes enforce non-null thereafter; in `schema.sql`, declare it `TEXT NOT NULL` directly.

- [ ] **Step 4: Run schema tests**

Run: `node --test tests/silent-sync-schema.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add schema.sql migrations/0005_silent_cross_device_sync.sql tests/silent-sync-schema.test.js
git commit -m "feat: add data revision schema"
```

---

### Task 2: Revision Helpers and Status API

**Files:**
- Create: `functions/_lib/data-revisions.js`
- Create: `functions/api/sync-status.js`
- Modify: `tests/helpers/fake-document-db.js`
- Create: `tests/sync-status-api.test.js`

**Interfaces:**
- Produces: `ZERO_REVISIONS` with camel-case API keys.
- Produces: `revisionStatement(db, userId)` returning a prepared SELECT.
- Produces: `mapRevisions(row)` returning `{ todosRevision, directoriesRevision, documentsRevision }`.
- Produces: `GET /api/sync-status` response `{ code: 'OK', data: revisions }`.

- [ ] **Step 1: Write failing helper and endpoint tests**

Cover an authenticated user with no revision row returning three zeros, a populated row mapping snake-case columns to camel case, account isolation, `Cache-Control: no-store`, and an unauthenticated request returning 401.

```js
test('returns account-scoped revisions without caching', async () => {
  const { db } = createDocumentDb({ revisions: {
    'user-1': { todos_revision: 3, directories_revision: 4, documents_revision: 5 },
    'user-2': { todos_revision: 90, directories_revision: 90, documents_revision: 90 },
  }});
  const response = await call(db);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual((await response.json()).data, {
    todosRevision: 3, directoriesRevision: 4, documentsRevision: 5,
  });
});
```

- [ ] **Step 2: Run endpoint tests and verify failure**

Run: `node --test tests/sync-status-api.test.js`

Expected: FAIL with module-not-found for `functions/api/sync-status.js`.

- [ ] **Step 3: Implement helpers and endpoint**

`functions/_lib/data-revisions.js` must expose:

```js
export const ZERO_REVISIONS = Object.freeze({
  todosRevision: 0,
  directoriesRevision: 0,
  documentsRevision: 0,
});

export function revisionStatement(db, userId) {
  return db.prepare(`SELECT todos_revision, directories_revision, documents_revision
    FROM user_data_revisions WHERE user_id = ?`).bind(userId);
}

export function mapRevisions(row) {
  return {
    todosRevision: Number(row?.todos_revision || 0),
    directoriesRevision: Number(row?.directories_revision || 0),
    documentsRevision: Number(row?.documents_revision || 0),
  };
}
```

The endpoint must call `requireUser`, read one revision row, and return `json({ code: 'OK', data: mapRevisions(row) })`.

Extend the fake DB state with `todos` and `revisions`, include them in batch rollback snapshots, and handle the revision SELECT exactly. Fake mutation handlers introduced in later tasks must increment the matching revision to emulate database triggers.

- [ ] **Step 4: Run endpoint and existing document API tests**

Run: `node --test tests/sync-status-api.test.js tests/document-links-api.test.js tests/document-directories-api.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add functions/_lib/data-revisions.js functions/api/sync-status.js tests/helpers/fake-document-db.js tests/sync-status-api.test.js
git commit -m "feat: expose data sync revisions"
```

---

### Task 3: Revision-Aware Document and Directory APIs

**Files:**
- Modify: `functions/api/document-links.js`
- Modify: `functions/api/document-directories.js`
- Modify: `functions/_lib/document-links.js`
- Modify: `tests/helpers/fake-document-db.js`
- Modify: `tests/document-links-api.test.js`
- Modify: `tests/document-directories-api.test.js`

**Interfaces:**
- Document GET produces `{ data: { documents, revision } }`.
- Directory GET produces `{ data: { directories, revision } }`.
- Document PUT consumes `{ id, directoryId, title, description, baseUpdatedAt, force? }`.
- Directory rename PUT consumes `{ id, name, baseUpdatedAt, force? }`.
- Conflict response is status 409 with `{ code: 'EDIT_CONFLICT', message, current }`; `current` is the latest mapped owned record or `null` when the ID is no longer accessible. Returning the same response for a deleted and foreign ID avoids leaking ownership while allowing an editor to treat its previously owned missing record as remotely deleted.
- Successful writes include `revision` beside the returned record/data.

- [ ] **Step 1: Add failing revision and conflict tests**

Add tests proving list data and revision are read through one `db.batch`, each write increments and returns its domain revision, a matching `baseUpdatedAt` edits successfully, a stale token returns 409 without changing state, `force: true` overwrites, and a deleted current record returns `current: null`.

```js
test('stale document edit preserves remote data and returns conflict', async () => {
  const response = await call(db, 'PUT', {
    id: 'doc-1', directoryId: 'dir-1', title: '本地', description: '本地',
    baseUpdatedAt: '2026-01-01',
  });
  assert.equal(response.status, 409);
  const body = await response.json();
  assert.equal(body.code, 'EDIT_CONFLICT');
  assert.equal(body.current.title, '远端');
});
```

- [ ] **Step 2: Run focused tests and verify failure**

Run: `node --test tests/document-links-api.test.js tests/document-directories-api.test.js`

Expected: FAIL because revisions and optimistic tokens are absent.

- [ ] **Step 3: Implement consistent list snapshots**

For each GET, batch the existing list statement with `revisionStatement(db, userId)` and map the matching domain revision:

```js
const [listResult, revisionRow] = await env.DB.batch([
  env.DB.prepare(DOCUMENT_SELECT).bind(userId),
  revisionStatement(env.DB, userId),
]);
return json({ code: 'OK', data: {
  documents: listResult.results.map(mapDocument),
  revision: mapRevisions(revisionRow.results?.[0]).documentsRevision,
}});
```

Make the fake batch result match D1 result shapes for `.all()` and `.first()` statements.

- [ ] **Step 4: Implement conditional edits and revision-bearing writes**

Use conditional SQL predicates:

```sql
UPDATE document_links
SET directory_id = ?, title = ?, description = ?, updated_at = ?
WHERE id = ? AND user_id = ? AND (? = 1 OR updated_at = ?)
```

After a zero-change conditional update, read the current owned record: return `EDIT_CONFLICT` with that record for a stale token, or `EDIT_CONFLICT` with `current: null` when the ID is no longer accessible. Retain validation errors for invalid target directories. Execute successful write, returned-record SELECT, and revision SELECT in a single batch. Apply the same pattern to directory rename. Create/delete/move responses also include the post-write revision.

- [ ] **Step 5: Run document tests**

Run: `node --test tests/document-links-api.test.js tests/document-directories-api.test.js tests/document-links-domain.test.js`

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add functions/api/document-links.js functions/api/document-directories.js functions/_lib/document-links.js tests/helpers/fake-document-db.js tests/document-links-api.test.js tests/document-directories-api.test.js
git commit -m "feat: add revision-aware document writes"
```

---

### Task 4: Revision-Aware Todo API and Storage Client

**Files:**
- Modify: `functions/api/d1.js`
- Modify: `d1-storage.js`
- Modify: `tests/helpers/fake-document-db.js`
- Create: `tests/todo-sync-api.test.js`
- Create: `tests/d1-storage-sync.test.js`

**Interfaces:**
- Todo records include `updatedAt`.
- Todo GET produces `{ data: { items, revision } }`.
- Todo PUT consumes `fields.baseUpdatedAt` and optional `fields.force` without persisting those control fields.
- `D1Storage.loadTodos()` remains compatible by returning items and recording `D1Storage.revision`.
- Produces: `D1Storage.refreshTodos(): Promise<{ items, revision }>`.
- Produces: `D1Storage.getRevision(): number`.
- Produces: `D1Storage.replaceSnapshot(items, revision): void`.
- Produces: `D1Storage.saveTodos(todos, { forceIds = new Set() } = {}): Promise<{ ok: boolean, conflict: null | { id, current } }>`.
- A thrown conflict error exposes `.code === 'EDIT_CONFLICT'` and `.current`.

- [ ] **Step 1: Write failing API and storage tests**

Cover GET revisions/update tokens, create/update/delete revision increments, stale edit conflict, forced edit, parsing structured error metadata, and replacement of the diff snapshot after a remote refresh.

```js
test('remote refresh replaces the todo diff baseline', async () => {
  const result = await storage.refreshTodos();
  assert.equal(result.revision, 7);
  assert.deepEqual([...storage.snapshot.keys()], ['remote-id']);
  assert.equal(storage.getRevision(), 7);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `node --test tests/todo-sync-api.test.js tests/d1-storage-sync.test.js`

Expected: FAIL because todo update tokens and storage refresh methods do not exist.

- [ ] **Step 3: Implement todo API snapshots and conflicts**

Add `updatedAt` to SELECT, mapper, insert, update allowlist, and responses. GET batches todo SELECT and revision SELECT. PUT uses:

```sql
UPDATE todos SET type = ?, title = ?, done = ?, date = ?, weekStart = ?,
  delayed = ?, createdAt = ?, updatedAt = ?
WHERE id = ? AND user_id = ? AND (? = 1 OR updatedAt = ?)
```

Return `409 EDIT_CONFLICT` with the current mapped todo or `null`. Successful POST/PUT/DELETE responses include `revision`; POST and PUT include the complete saved `todo`.

- [ ] **Step 4: Implement storage revision and error semantics**

Change `apiRequest` errors to retain `code`, `current`, and `fields`. Keep `loadTodos()` returning the item array for current callers while setting `revision`. Add:

```js
async refreshTodos() {
  const data = await apiRequest('GET');
  const items = data.data?.items || [];
  this.replaceSnapshot(items, Number(data.data?.revision || 0));
  return { items, revision: this.revision };
}
```

Each diff update submits the snapshot record's `updatedAt` as `baseUpdatedAt`; an explicit force-ID set submits `force: true`. Successful response records replace the matching in-memory todo and snapshot entry. Return `{ ok: true, conflict: null }` after all operations, `{ ok: false, conflict: { id, current } }` for `EDIT_CONFLICT`, and `{ ok: false, conflict: null }` for an ordinary network/API failure. Update existing callers to branch on `result.ok` instead of a boolean return.

- [ ] **Step 5: Run todo/storage tests**

Run: `node --test tests/todo-sync-api.test.js tests/d1-storage-sync.test.js`

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add functions/api/d1.js d1-storage.js tests/helpers/fake-document-db.js tests/todo-sync-api.test.js tests/d1-storage-sync.test.js
git commit -m "feat: add revision-aware todo storage"
```

---

### Task 5: Visibility-Aware Sync Coordinator

**Files:**
- Create: `sync-coordinator.js`
- Create: `tests/sync-coordinator.test.js`

**Interfaces:**
- Produces: `createSyncCoordinator({ requestStatus, onStatus, documentRef, windowRef, setTimer, clearTimer, random, intervalMs, jitterMs, focusDedupeMs })`.
- Returned object exposes `start()`, `stop()`, and `checkNow()`.
- `onStatus(revisions)` returns a promise and owns domain refresh behavior.

- [ ] **Step 1: Write deterministic failing coordinator tests**

Inject fake timers, visibility state, event targets, and `random: () => 0`. Verify start performs one immediate check, visible completion schedules 60,000 ms, hidden state schedules nothing, focus/visibility events deduplicate within 250 ms, concurrent triggers share one request, failed checks reschedule, and stop removes listeners/invalidates in-flight results.

```js
const coordinator = createSyncCoordinator({
  requestStatus, onStatus, documentRef, windowRef,
  setTimer: timers.set, clearTimer: timers.clear,
  random: () => 0, intervalMs: 60_000, jitterMs: 5_000, focusDedupeMs: 250,
});
```

- [ ] **Step 2: Run test and verify failure**

Run: `node --test tests/sync-coordinator.test.js`

Expected: FAIL with module-not-found for `sync-coordinator.js`.

- [ ] **Step 3: Implement the coordinator state machine**

Maintain `running`, `generation`, `inFlight`, `queued`, `timerId`, and `lastResumeAt`. `checkNow()` must return the current promise when in flight and set `queued` only for a non-duplicate explicit trigger. In `finally`, run one queued check or schedule the next `intervalMs + floor(random() * jitterMs)` check when visible. `stop()` increments generation, clears the timer, resets queued state, and removes listeners.

- [ ] **Step 4: Run coordinator tests**

Run: `node --test tests/sync-coordinator.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add sync-coordinator.js tests/sync-coordinator.test.js
git commit -m "feat: add silent sync coordinator"
```

---

### Task 6: Silent Document Store Refresh and Keyed UI

**Files:**
- Modify: `document-links-state.js`
- Modify: `document-links-ui.js`
- Modify: `tests/document-links-state.test.js`
- Modify: `tests/document-links-ui.test.js`

**Interfaces:**
- State adds `revisions: { directories: number, documents: number }` and `conflict` on the active editor.
- Produces: `prefetch(): Promise<boolean>` for initial directory/document loading without visible loading status.
- Produces: `sync(revisions): Promise<void>` fetching only changed document domains.
- Produces: `resolveConflict(choice: 'remote' | 'overwrite'): Promise<boolean>`.
- Browser lifecycle exposes `window.__documentLinksPrefetch`, `window.__documentLinksSync`, `window.__documentLinksRevisions`, and the existing reset hook.

- [ ] **Step 1: Write failing store tests**

Verify prefetch requests directories/documents in parallel, stores response revisions, does not set `status: 'loading'`, unchanged remote revisions make no requests, one changed revision fetches one endpoint, failed domains retain their revision, active-editor remote changes retain the draft, and conflict choices behave as specified.

```js
await store.sync({ directoriesRevision: 1, documentsRevision: 3 });
assert.deepEqual(calls.map(({ url }) => url), ['/api/document-links']);
assert.equal(store.getState().editor.draft.title, '未保存标题');
```

- [ ] **Step 2: Run store tests and verify failure**

Run: `node --test tests/document-links-state.test.js`

Expected: FAIL because prefetch/sync/revision state do not exist.

- [ ] **Step 3: Implement revision-aware store methods**

Split directory and document fetch/application into private functions. `prefetch()` uses `Promise.allSettled`, never changes status to `loading`, and marks `ready` when both initial domains settle successfully. `sync()` compares remote revisions, fetches only newer domains, applies successful snapshots, and updates revision only after application. When the remote snapshot changes the active document, preserve `editor.draft`, store `editor.conflict.current`, and update non-editor collections normally.

All document/directory writes include base versions, consume returned revision, and turn `EDIT_CONFLICT` into editor or rename state instead of a generic failure.

- [ ] **Step 4: Write failing keyed-DOM tests**

Keep references to unchanged directory/document fake nodes, apply a snapshot that changes one document and inserts another, and assert unchanged nodes retain object identity. Assert no background path calls `content.replaceChildren`, focus remains on the active input, and conflict buttons invoke `resolveConflict`.

- [ ] **Step 5: Run UI tests and verify failure**

Run: `node --test tests/document-links-ui.test.js`

Expected: FAIL because current render replaces all directory nodes.

- [ ] **Step 6: Implement keyed directory/document reconciliation**

Assign `data-directory-id` and `data-document-id` when creating nodes. Add `patchDirectoryNode`, `patchDocumentNode`, and `reconcileKeyedChildren(parent, nextItems, keyOf, createNode, patchNode)`; the reconciler removes absent keys, moves/inserts nodes into target order with `insertBefore`, and patches only changed records. Preserve the existing editor DOM optimization and do not patch the protected row. Add inline conflict copy and “使用远端内容”/“仍然覆盖” buttons.

- [ ] **Step 7: Run document client tests**

Run: `node --test tests/document-links-state.test.js tests/document-links-ui.test.js tests/feature-tabs.test.js`

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add document-links-state.js document-links-ui.js tests/document-links-state.test.js tests/document-links-ui.test.js
git commit -m "feat: silently reconcile document links"
```

---

### Task 7: Silent Todo Merge and Keyed UI

**Files:**
- Create: `todo-sync.js`
- Modify: `index.html`
- Create: `tests/todo-sync.test.js`
- Modify: `tests/feature-tabs-markup.test.js`

**Interfaces:**
- Produces: `mergeTodoSnapshot(current, remote, protectedIds)` returning `{ items, changedIds, removedIds, conflicts }` while preserving object identity for unchanged and protected records.
- Produces: `reconcileKeyedTodos({ containers, previous, next, createNode, patchNode, activeEditorId })`.
- Page lifecycle exposes `window.__todoAppSync(revisions)`, `window.__todoAppRevision()`, and keeps `window.__todoAppInit()` for initial startup.

- [ ] **Step 1: Write failing pure merge tests**

Cover unchanged object identity, remote insert/delete/update, protected local edit, remote deletion during edit, and changed-ID reporting.

```js
const result = mergeTodoSnapshot(current, remote, new Set(['editing']));
assert.equal(result.items.find(({ id }) => id === 'editing'), current[0]);
assert.equal(result.conflicts.get('editing').current.title, '远端标题');
```

- [ ] **Step 2: Run merge tests and verify failure**

Run: `node --test tests/todo-sync.test.js`

Expected: FAIL with module-not-found for `todo-sync.js`.

- [ ] **Step 3: Implement pure merge and reconciliation helpers**

`mergeTodoSnapshot` compares serialized domain fields including `updatedAt`; unchanged records reuse the current object, ordinary remote changes patch the existing object in place, protected changes retain the local object and record `{ current: remoteTodo | null }`. `reconcileKeyedTodos` must remove only absent IDs, move nodes between A/B/date groups when classification changes, patch only changed rows, and skip the active editor node.

- [ ] **Step 4: Add failing page integration tests**

Assert `index.html` loads `todo-sync.js`, exposes the three lifecycle functions, no background sync path invokes `renderAll()`, and the active title editor renders the remote/overwrite conflict actions without replacing its input.

- [ ] **Step 5: Run integration test and verify failure**

Run: `node --test tests/todo-sync.test.js tests/feature-tabs-markup.test.js`

Expected: FAIL because the page has no todo sync lifecycle.

- [ ] **Step 6: Wire todo synchronization into the page**

Track `activeTodoEditorId` and `todoConflicts`. Initial `init()` loads and renders once. `__todoAppSync({ todosRevision })` compares `D1Storage.getRevision()`, waits for `saveTodosChain`, calls `refreshTodos()` only when newer, merges snapshots, and invokes keyed reconciliation. Editing begins with the record's `updatedAt`; a conflict keeps the input and adds two inline actions. “使用远端内容” applies `conflict.current` or removes a remotely deleted record. “仍然覆盖” calls the storage save path with the ID in a force set.

Update counts and only the affected A/B/day containers; retain `renderAll()` for first render and week navigation.

- [ ] **Step 7: Run todo and markup tests**

Run: `node --test tests/todo-sync.test.js tests/feature-tabs-markup.test.js tests/d1-storage-sync.test.js`

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add todo-sync.js index.html tests/todo-sync.test.js tests/feature-tabs-markup.test.js
git commit -m "feat: silently reconcile todos"
```

---

### Task 8: Authenticated Prefetch and Full Sync Wiring

**Files:**
- Modify: `auth-ui.js`
- Modify: `feature-tabs.js`
- Modify: `document-links-ui.js`
- Modify: `scripts/prepare-pages.mjs`
- Modify: `package.json`
- Create: `tests/silent-sync-integration.test.js`
- Modify: `tests/feature-tabs.test.js`

**Interfaces:**
- Auth startup calls both prefetch hooks before starting one coordinator.
- Auth teardown stops the coordinator and resets both user-scoped stores.
- Document tab activation only changes visibility and never loads data.

- [ ] **Step 1: Write failing lifecycle/markup tests**

Assert auth code imports/creates the coordinator, `showApp` starts todo/document prefetch plus coordinator for the authenticated user, `showLogin` stops it, document activation has no load callback, build copies `sync-coordinator.js` and `todo-sync.js`, and `package.json` checks all new modules/endpoints.

- [ ] **Step 2: Run integration tests and verify failure**

Run: `node --test tests/silent-sync-integration.test.js tests/feature-tabs.test.js tests/feature-tabs-markup.test.js`

Expected: FAIL because synchronization is not wired to auth lifecycle.

- [ ] **Step 3: Wire lifecycle without script-order races**

Convert `auth-ui.js` to a module or expose a single `window.__syncReady` registration so bootstrap cannot call hooks before modules exist. Prefer a module import:

```js
import { createSyncCoordinator } from './sync-coordinator.js';
```

`showApp(user)` must reset stale user state, await/launch `__todoAppInit()` and `__documentLinksPrefetch()` concurrently, then call `coordinator.start()`. The coordinator requests `/api/sync-status` with same-origin credentials and passes revisions to `Promise.allSettled([__todoAppSync(revisions), __documentLinksSync(revisions)])`. `showLogin()` calls `coordinator.stop()`, `D1Storage.reset()`, todo reset, and document reset.

Remove `onDocumentsActivated` loading from `feature-tabs.js`; the tab click only toggles panels and controls.

- [ ] **Step 4: Update deployment/build checks**

Add `sync-coordinator.js` and `todo-sync.js` to `scripts/prepare-pages.mjs`. Add syntax checks for both browser modules, `functions/api/sync-status.js`, and the three modified APIs to the `check` script.

- [ ] **Step 5: Run integration and relevant regression tests**

Run: `node --test tests/silent-sync-integration.test.js tests/feature-tabs.test.js tests/feature-tabs-markup.test.js tests/document-links-state.test.js tests/document-links-ui.test.js tests/todo-sync.test.js tests/sync-coordinator.test.js`

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add auth-ui.js feature-tabs.js document-links-ui.js scripts/prepare-pages.mjs package.json tests/silent-sync-integration.test.js tests/feature-tabs.test.js tests/feature-tabs-markup.test.js
git commit -m "feat: wire authenticated silent synchronization"
```

---

### Task 9: Full Verification and Manual Cross-Client Check

**Files:**
- Modify only if a verification failure reveals a requirement gap; do not bundle unrelated cleanup.

**Interfaces:**
- Consumes all prior task interfaces.
- Produces a verified build-ready implementation.

- [ ] **Step 1: Run syntax checks**

Run: `npm.cmd run check`

Expected: exit code 0 with every listed file passing `node --check`.

- [ ] **Step 2: Run the complete automated suite**

Run: `npm.cmd test`

Expected: all tests pass with zero failed, cancelled, or skipped synchronization tests.

- [ ] **Step 3: Build the Pages artifact**

Run: `npm.cmd run build`

Expected: exit code 0; output includes copied `sync-coordinator.js` and `todo-sync.js` alongside the existing app files.

- [ ] **Step 4: Perform browser behavior verification**

Use two authenticated clients against the same development/preview backend:

1. Keep client A on To-do List and change a todo in client B; verify only its row changes in A within 60 seconds.
2. Hide client A, change a document in B, restore A; verify immediate row-only update with no loading text.
3. Begin editing the same document in A, update it in B, restore A, and verify A retains its input and offers remote/overwrite actions.
4. Disable network in A for one interval, restore it, and verify old content remains then synchronizes on the next focus/check.
5. Enter Document Links immediately after login and verify no “正在加载…” state is rendered.

- [ ] **Step 5: Inspect the final diff**

Run: `git status --short`

Expected: only intended implementation files are modified; pre-existing unrelated user changes remain untouched.

Run: `git diff --check`

Expected: no whitespace errors.

- [ ] **Step 6: Commit any verification-only corrections**

If verification required changes, stage only the affected synchronization files and commit:

```powershell
git commit -m "fix: complete silent sync verification"
```

If no correction was needed, do not create an empty commit.
