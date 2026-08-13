# Document Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an account-scoped document-link library with editable one-level directories, inline document editing and moving, safe deletion, and a responsive interface that replaces the existing document placeholder.

**Architecture:** Keep the existing single-page application and Cloudflare Pages Functions/D1 stack. Add three focused database tables, shared server-side domain validation, separate directory and document APIs, a pure/testable client state module, and a DOM UI module. Extend the existing feature-tab controller only for top-right controls and lazy document loading; leave todo persistence and rendering untouched.

**Tech Stack:** Static HTML/CSS, browser-native ES modules and DOM APIs, Cloudflare Pages Functions, D1/SQLite migrations, Node.js built-in test runner (`node:test`), existing authentication and HTTP helpers.

## Global Constraints

- Titles are required and contain 1–20 Unicode code points after trimming.
- Descriptions are required and contain 1–100 Unicode code points after trimming.
- Directory names are required and contain 1–20 Unicode code points after trimming.
- Directory names are unique per account using `trim().toLocaleLowerCase('zh-CN')` comparison.
- Every new account receives `赠品管理`, `产品文档`, and `销售政策` once, in that order; deleting all directories must not recreate them.
- Directories sort by `created_at ASC, id ASC`; documents sort by `created_at DESC, id ASC`; moving a document does not change `created_at`.
- Descriptions remain selectable plain text and never become links.
- Only empty directories can be deleted; document and directory deletions use an application confirmation dialog.
- Only one document row can be in add/edit mode at a time.
- Remove the bottom-left `无限期 / 周待办 / 日待办` legend permanently; preserve all bottom-right account controls.
- No subdirectories, drag sorting, search, tags, rich text, automatic link metadata, attachments, archive, or recycle bin.
- Do not add third-party runtime or test dependencies.
- `schema.sql` and `index.html` already contain unrelated working-tree changes. Merge additions into their current contents and never replace or revert those changes.

## File Map

- Create `migrations/0003_document_links.sql`: production D1 schema migration.
- Modify `schema.sql`: fresh-install schema equivalent to migration 0003.
- Create `functions/_lib/document-links.js`: normalization, Unicode length validation, row mapping, and initial-directory constants.
- Create `functions/api/document-directories.js`: directory initialization and CRUD endpoint.
- Create `functions/api/document-links.js`: document CRUD/move endpoint.
- Create `tests/document-links-domain.test.js`: pure domain-rule tests.
- Create `tests/helpers/fake-document-db.js`: deterministic D1 test double for auth and document APIs.
- Create `tests/document-directories-api.test.js`: initialization, isolation, duplicate, count, and delete rules.
- Create `tests/document-links-api.test.js`: document validation, CRUD, movement, ordering, and isolation.
- Create `document-links-state.js`: API client, normalized runtime state, validators, sorting, and one-editor rule.
- Create `tests/document-links-state.test.js`: pure client behavior tests.
- Create `document-links-ui.js`: DOM rendering, inline editor, directory modal, accessible confirmation dialog, lazy initialization, and reset.
- Create `tests/document-links-ui.test.js`: lightweight fake-DOM behavior tests for text rendering, editing, cancel, and error retention.
- Modify `feature-tabs.js`: switch week navigation and directory-management controls; dispatch lazy-load event.
- Modify `tests/feature-tabs.test.js`: updated controller contract.
- Modify `index.html`: real document panel markup, modal markup, styles, remove legend, load modules.
- Modify `tests/feature-tabs-markup.test.js`: replace placeholder/legend assertions with final integration assertions.
- Modify `auth-ui.js`: reset document runtime state when login UI is shown and initialize the module after login.
- Modify `scripts/prepare-pages.mjs`: copy the new client modules.
- Modify `package.json`: include new client modules in syntax checks.

---

### Task 1: Database schema and shared document domain rules

**Files:**
- Create: `migrations/0003_document_links.sql`
- Modify: `schema.sql`
- Create: `functions/_lib/document-links.js`
- Create: `tests/document-links-domain.test.js`

**Interfaces:**
- Produces: `INITIAL_DIRECTORY_NAMES`, `normalizeText(value)`, `unicodeLength(value)`, `directoryNameKey(value)`, `validateDirectoryName(value)`, `validateDocumentFields(fields)`, `mapDirectory(row)`, and `mapDocument(row)`.
- Database contract: `document_directory_states`, `document_directories`, and `document_links` with account-scoped indexes and restrictive directory deletion.

- [ ] **Step 1: Write failing pure domain tests**

Create `tests/document-links-domain.test.js`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  INITIAL_DIRECTORY_NAMES,
  directoryNameKey,
  normalizeText,
  unicodeLength,
  validateDirectoryName,
  validateDocumentFields,
} from '../functions/_lib/document-links.js';

test('initial directories have the agreed stable order', () => {
  assert.deepEqual(INITIAL_DIRECTORY_NAMES, ['赠品管理', '产品文档', '销售政策']);
});

test('normalization trims and duplicate keys ignore case', () => {
  assert.equal(normalizeText('  Product A  '), 'Product A');
  assert.equal(directoryNameKey('  Product A  '), directoryNameKey('product a'));
});

test('Unicode code points count Chinese and emoji as one character', () => {
  assert.equal(unicodeLength('中文😀'), 3);
});

test('directory names enforce the 1-20 character contract', () => {
  assert.match(validateDirectoryName(''), /必填/);
  assert.equal(validateDirectoryName('产'.repeat(20)), '');
  assert.match(validateDirectoryName('产'.repeat(21)), /20/);
});

test('documents require valid title, description, and directory', () => {
  assert.deepEqual(validateDocumentFields({ directoryId: 'dir-1', title: '标题', description: 'https://a.test' }), {});
  assert.ok(validateDocumentFields({ directoryId: '', title: '', description: '' }).directoryId);
  assert.ok(validateDocumentFields({ directoryId: 'dir-1', title: '题'.repeat(21), description: 'x' }).title);
  assert.ok(validateDocumentFields({ directoryId: 'dir-1', title: 'x', description: '描'.repeat(101) }).description);
});
```

- [ ] **Step 2: Run the domain test and verify RED**

Run: `node --test tests/document-links-domain.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `functions/_lib/document-links.js`.

- [ ] **Step 3: Implement the shared domain module**

Create `functions/_lib/document-links.js`:

```js
export const INITIAL_DIRECTORY_NAMES = Object.freeze(['赠品管理', '产品文档', '销售政策']);

export function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function unicodeLength(value) {
  return [...String(value ?? '')].length;
}

export function directoryNameKey(value) {
  return normalizeText(value).toLocaleLowerCase('zh-CN');
}

export function validateDirectoryName(value) {
  const name = normalizeText(value);
  if (!name) return '目录名称为必填项';
  if (unicodeLength(name) > 20) return '目录名称不能超过 20 个字符';
  return '';
}

export function validateDocumentFields(fields) {
  const errors = {};
  const title = normalizeText(fields?.title);
  const description = normalizeText(fields?.description);
  if (!normalizeText(fields?.directoryId)) errors.directoryId = '请选择所属目录';
  if (!title) errors.title = '标题为必填项';
  else if (unicodeLength(title) > 20) errors.title = '标题不能超过 20 个字符';
  if (!description) errors.description = '描述为必填项';
  else if (unicodeLength(description) > 100) errors.description = '描述不能超过 100 个字符';
  return errors;
}

export function mapDirectory(row) {
  return {
    id: row.id,
    name: row.name,
    documentCount: Number(row.document_count ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapDocument(row) {
  return {
    id: row.id,
    directoryId: row.directory_id,
    title: row.title,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
```

- [ ] **Step 4: Add the production migration**

Create `migrations/0003_document_links.sql` with this exact schema:

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE document_directory_states (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  initialized_at TEXT NOT NULL
);

CREATE TABLE document_directories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, name_key)
);

CREATE TABLE document_links (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  directory_id TEXT NOT NULL REFERENCES document_directories(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_document_directories_user_created
  ON document_directories(user_id, created_at, id);
CREATE INDEX idx_document_links_user_created
  ON document_links(user_id, created_at DESC, id);
CREATE INDEX idx_document_links_user_directory
  ON document_links(user_id, directory_id);
```

Append the same `CREATE TABLE IF NOT EXISTS`/`CREATE INDEX IF NOT EXISTS` definitions to the current `schema.sql`. Do not alter its existing users, todos, sessions, or Feishu definitions.

- [ ] **Step 5: Verify schema and domain rules**

Run:

```powershell
node --test tests/document-links-domain.test.js
node --check functions/_lib/document-links.js
Select-String -LiteralPath migrations/0003_document_links.sql -Pattern 'ON DELETE RESTRICT','UNIQUE (user_id, name_key)','document_directory_states'
git diff --check -- migrations/0003_document_links.sql schema.sql functions/_lib/document-links.js tests/document-links-domain.test.js
```

Expected: 5 tests pass; syntax check exits 0; all three SQL patterns are found; diff check is clean.

- [ ] **Step 6: Commit the isolated schema/domain task**

```powershell
git add -- migrations/0003_document_links.sql functions/_lib/document-links.js tests/document-links-domain.test.js
git add -p -- schema.sql
git diff --cached -- schema.sql
git commit -m "feat: add document links data model"
```

Accept only the new document-link schema hunks from `schema.sql`. Confirm `git diff --cached -- schema.sql` contains no unrelated Feishu or user-owned changes before committing.

---

### Task 2: Account-scoped directory API and one-time initialization

**Files:**
- Create: `functions/api/document-directories.js`
- Create: `tests/helpers/fake-document-db.js`
- Create: `tests/document-directories-api.test.js`

**Interfaces:**
- Consumes: shared functions from `functions/_lib/document-links.js`; `requireUser`, `error`, `json`, `readJson`, `requireSameOrigin`, and `methodNotAllowed`.
- Produces: `onRequest({ request, env })` for `/api/document-directories`.
- Response contract: GET `{ code: 'OK', data: { directories } }`; POST 201 `{ code: 'OK', directory }`; PUT `{ code: 'OK', directory }`; DELETE `{ code: 'OK' }`.

- [ ] **Step 1: Build the reusable D1 test double**

Create `tests/helpers/fake-document-db.js`. It must expose `createDocumentDb({ users, directories, documents, initializedUsers })`, return `{ db, state }`, and implement `prepare(sql).bind(...values).first()/all()/run()` plus `batch(statements)`. Normalize SQL whitespace before routing. Cover exactly these query families used by auth and the two new APIs:

```js
const normalized = sql.replace(/\s+/g, ' ').trim();

if (normalized.includes('FROM sessions s JOIN users u')) return authSessionQuery(state, values);
if (normalized.startsWith('UPDATE sessions SET last_active_at')) return changes(1);
if (normalized.startsWith('SELECT user_id FROM document_directory_states')) return initializationStateQuery(state, values);
if (normalized.startsWith('INSERT INTO document_directory_states')) return insertInitializationState(state, values);
if (normalized.startsWith('INSERT INTO document_directories')) return insertDirectory(state, values);
if (normalized.includes('FROM document_directories d') && normalized.includes('document_count')) return listDirectories(state, values);
if (normalized.startsWith('SELECT id FROM document_directories')) return findDirectory(state, values);
if (normalized.startsWith('UPDATE document_directories SET')) return updateDirectory(state, values);
if (normalized.startsWith('DELETE FROM document_directories')) return deleteEmptyDirectory(state, values);
```

Use a fixed valid session token hash fixture by accepting any `token_hash` lookup when the request cookie is `xiaohu_session=test-session`; return an active user with `must_change_password: 0`. The test double must enforce `(user_id, name_key)` uniqueness and return `{ meta: { changes } }` from `run()`.

- [ ] **Step 2: Write failing directory API tests**

Create `tests/document-directories-api.test.js` with helpers:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { onRequest } from '../functions/api/document-directories.js';
import { createDocumentDb } from './helpers/fake-document-db.js';

function request(method = 'GET', body, query = '') {
  return new Request(`https://todo.test/api/document-directories${query}`, {
    method,
    headers: {
      Cookie: 'xiaohu_session=test-session',
      ...(method === 'GET' ? {} : { Origin: 'https://todo.test', 'Content-Type': 'application/json' }),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function call(db, method, body, query) {
  return onRequest({ request: request(method, body, query), env: { DB: db } });
}
```

Add tests that assert:

1. First GET creates exactly `赠品管理`, `产品文档`, `销售政策` and records initialization.
2. Deleting all three and issuing another GET returns `[]` without recreating them.
3. POST trims names and returns 201; `Product` followed by `product` returns 409 `DIRECTORY_NAME_CONFLICT`.
4. PUT updates only a directory owned by the current user; a foreign ID returns 404.
5. GET counts only documents owned by the same user and returns `created_at ASC, id ASC`.
6. DELETE returns 409 `DIRECTORY_NOT_EMPTY` for a non-empty directory and succeeds for an empty one.
7. Any write without an exact same-origin header returns 403.

- [ ] **Step 3: Run directory tests and verify RED**

Run: `node --test tests/document-directories-api.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `functions/api/document-directories.js`.

- [ ] **Step 4: Implement the directory endpoint**

Create `functions/api/document-directories.js` with one exported `onRequest`. Use this dispatch and validation structure:

```js
import { requireUser } from '../_lib/auth.js';
import { error, json, methodNotAllowed, readJson, requireSameOrigin } from '../_lib/http.js';
import {
  INITIAL_DIRECTORY_NAMES,
  directoryNameKey,
  mapDirectory,
  normalizeText,
  validateDirectoryName,
} from '../_lib/document-links.js';

const DIRECTORY_SELECT = `
  SELECT d.id, d.name, d.created_at, d.updated_at,
         COUNT(l.id) AS document_count
  FROM document_directories d
  LEFT JOIN document_links l
    ON l.directory_id = d.id AND l.user_id = d.user_id
  WHERE d.user_id = ?
  GROUP BY d.id
  ORDER BY d.created_at ASC, d.id ASC`;

function nowIso() { return new Date().toISOString(); }

async function ensureInitialDirectories(db, userId) {
  const state = await db.prepare(
    'SELECT user_id FROM document_directory_states WHERE user_id = ?'
  ).bind(userId).first();
  if (state) return;
  const timestamp = nowIso();
  const statements = INITIAL_DIRECTORY_NAMES.map((name, index) => db.prepare(
    `INSERT INTO document_directories
      (id, user_id, name, name_key, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(
    crypto.randomUUID(), userId, name, directoryNameKey(name),
    new Date(Date.parse(timestamp) + index).toISOString(), timestamp
  ));
  statements.push(db.prepare(
    'INSERT INTO document_directory_states (user_id, initialized_at) VALUES (?, ?)'
  ).bind(userId, timestamp));
  await db.batch(statements);
}
```

For POST/PUT, return 400 `INVALID_DIRECTORY` on length/required errors and 409 `DIRECTORY_NAME_CONFLICT` on uniqueness conflicts. For DELETE, execute one guarded statement:

```sql
DELETE FROM document_directories
WHERE id = ? AND user_id = ?
  AND NOT EXISTS (
    SELECT 1 FROM document_links
    WHERE directory_id = ? AND user_id = ?
  )
```

If it changes zero rows, query ownership and document existence to distinguish 404 `DIRECTORY_NOT_FOUND` from 409 `DIRECTORY_NOT_EMPTY`. Wrap database exceptions; map unique constraint errors to conflict and all other failures to 500 `INTERNAL_ERROR` without returning raw database text.

- [ ] **Step 5: Verify directory API**

Run:

```powershell
node --test tests/document-links-domain.test.js tests/document-directories-api.test.js
node --check functions/api/document-directories.js
```

Expected: all tests pass and syntax check exits 0.

- [ ] **Step 6: Commit the directory API task**

```powershell
git add -- functions/api/document-directories.js tests/helpers/fake-document-db.js tests/document-directories-api.test.js
git commit -m "feat: add document directory API"
```

---

### Task 3: Account-scoped document CRUD and move API

**Files:**
- Create: `functions/api/document-links.js`
- Modify: `tests/helpers/fake-document-db.js`
- Create: `tests/document-links-api.test.js`

**Interfaces:**
- Consumes: the domain helpers and directory ownership established in Tasks 1–2.
- Produces: `onRequest({ request, env })` for `/api/document-links`.
- Response contract: GET `{ code: 'OK', data: { documents } }`; POST 201 `{ code: 'OK', document }`; PUT `{ code: 'OK', document }`; DELETE `{ code: 'OK' }`.

- [ ] **Step 1: Extend the fake D1 router for document queries**

Add handlers for:

```js
if (normalized.includes('FROM document_links') && normalized.includes('ORDER BY created_at DESC')) return listDocuments(state, values);
if (normalized.startsWith('INSERT INTO document_links')) return insertDocument(state, values);
if (normalized.startsWith('SELECT id FROM document_links')) return findDocument(state, values);
if (normalized.startsWith('UPDATE document_links SET')) return updateDocument(state, values);
if (normalized.startsWith('DELETE FROM document_links')) return deleteDocument(state, values);
```

Each handler must filter by every supplied `user_id`, enforce target-directory ownership, preserve `created_at` on update, and sort documents by `created_at DESC, id ASC`.

- [ ] **Step 2: Write failing document API tests**

Create `tests/document-links-api.test.js` using the same authenticated request pattern as Task 2. Add tests for:

1. POST trims title/description, uses a server UUID/time, and returns 201.
2. Empty/over-limit title and description return 400 `INVALID_DOCUMENT` with field errors.
3. POST to another account's directory returns 404 `DIRECTORY_NOT_FOUND`.
4. GET returns only the current account's records in `created_at DESC, id ASC` order.
5. PUT changes title and description and moves to another owned directory while preserving `createdAt`.
6. PUT cannot move into another account's directory and cannot modify another account's document.
7. DELETE removes only the current account's document; foreign IDs return 404.
8. `description: '<script>alert(1)</script>'` is stored as literal text without transformation.

- [ ] **Step 3: Run document API tests and verify RED**

Run: `node --test tests/document-links-api.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `functions/api/document-links.js`.

- [ ] **Step 4: Implement the document endpoint**

Create `functions/api/document-links.js`. Use `requireUser` and exact same-origin validation as Task 2. Before POST/PUT, run `validateDocumentFields`, normalize strings, and verify the target directory with:

```sql
SELECT id FROM document_directories WHERE id = ? AND user_id = ?
```

Use these SQL shapes:

```sql
SELECT id, directory_id, title, description, created_at, updated_at
FROM document_links
WHERE user_id = ?
ORDER BY created_at DESC, id ASC

INSERT INTO document_links
  (id, user_id, directory_id, title, description, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?)

UPDATE document_links
SET directory_id = ?, title = ?, description = ?, updated_at = ?
WHERE id = ? AND user_id = ?

DELETE FROM document_links WHERE id = ? AND user_id = ?
```

Generate IDs with `crypto.randomUUID()`. Return mapped rows using `mapDocument`; do not accept `userId`, `createdAt`, or `updatedAt` from the request body. Return 404 for foreign/missing resources and 500 for unexpected database errors without leaking details.

- [ ] **Step 5: Verify both APIs together**

Run:

```powershell
node --test tests/document-links-domain.test.js tests/document-directories-api.test.js tests/document-links-api.test.js
node --check functions/api/document-links.js
```

Expected: all tests pass and syntax check exits 0.

- [ ] **Step 6: Commit the document API task**

```powershell
git add -- functions/api/document-links.js tests/helpers/fake-document-db.js tests/document-links-api.test.js
git commit -m "feat: add document link API"
```

---

### Task 4: Testable client state, validation, and API client

**Files:**
- Create: `document-links-state.js`
- Create: `tests/document-links-state.test.js`

**Interfaces:**
- Produces: `createDocumentLinksStore({ request })` returning `{ getState, subscribe, load, reset, hydrateForTest, beginAdd, beginEdit, cancelEdit, updateDraft, saveDraft, deleteDocument, createDirectory, renameDirectory, deleteDirectory }`.
- State shape: `{ status, directories, documents, editor, error }`; `editor` is `null` or `{ mode: 'add'|'edit', documentId, draft, errors, saving }`.
- Request interface: `request(url, { method?, body? }) -> Promise<parsed JSON>`.

- [ ] **Step 1: Write failing client-state tests**

Create `tests/document-links-state.test.js` with an injected request spy and these concrete assertions:

```js
test('load fetches directories and documents once and sorts them', async () => {
  const { store, calls } = setup();
  await store.load();
  await store.load();
  assert.deepEqual(calls.map((call) => call.url), ['/api/document-directories', '/api/document-links']);
  assert.deepEqual(store.getState().directories.map((item) => item.id), ['dir-old', 'dir-new']);
  assert.deepEqual(store.getState().documents.map((item) => item.id), ['doc-new', 'doc-old']);
});

test('beginAdd permits only one active editor', () => {
  const { store } = setupReady();
  assert.equal(store.beginAdd('dir-old'), true);
  assert.equal(store.beginAdd('dir-new'), false);
  assert.equal(store.getState().editor.draft.directoryId, 'dir-old');
});

test('beginEdit copies all editable fields and cancel makes no request', () => {
  const { store, calls } = setupReady();
  store.beginEdit('doc-old');
  assert.deepEqual(store.getState().editor.draft, {
    directoryId: 'dir-old', title: '旧标题', description: '旧描述',
  });
  store.cancelEdit();
  assert.equal(store.getState().editor, null);
  assert.equal(calls.length, 0);
});

test('saveDraft validates Unicode limits before requesting', async () => {
  const { store, calls } = setupReady();
  store.beginAdd('dir-old');
  store.updateDraft({ title: '题'.repeat(21), description: '说明' });
  assert.equal(await store.saveDraft(), false);
  assert.match(store.getState().editor.errors.title, /20/);
  assert.equal(calls.length, 0);
});

test('failed save retains the draft and exposes its error', async () => {
  const { store } = setupReady({ saveError: new Error('网络错误') });
  store.beginAdd('dir-old');
  store.updateDraft({ title: '标题', description: '描述' });
  await store.saveDraft();
  assert.equal(store.getState().editor.draft.title, '标题');
  assert.equal(store.getState().editor.error, '网络错误');
});

test('successful move preserves createdAt and changes directory', async () => {
  const { store } = setupReady();
  const createdAt = store.getState().documents.find((item) => item.id === 'doc-old').createdAt;
  store.beginEdit('doc-old');
  store.updateDraft({ directoryId: 'dir-new' });
  assert.equal(await store.saveDraft(), true);
  const moved = store.getState().documents.find((item) => item.id === 'doc-old');
  assert.equal(moved.directoryId, 'dir-new');
  assert.equal(moved.createdAt, createdAt);
});

test('reset clears scoped state and permits a fresh load', async () => {
  const { store, calls } = setup();
  await store.load();
  store.reset();
  assert.deepEqual(store.getState().directories, []);
  await store.load();
  assert.equal(calls.filter((call) => call.url === '/api/document-directories').length, 2);
});
```

In the same test file, define `setup()` and `setupReady()` fixtures with two deliberately unsorted directories/documents, and make the injected request record `{ url, method, body }`. `setupReady()` calls the store's synchronous `hydrateForTest({ directories, documents })` export; implement that export only for deterministic unit setup and keep it free of DOM behavior.

The request spy should return deterministic directory/document payloads and throw `new Error('网络错误')` for the failure case.

- [ ] **Step 2: Run client-state tests and verify RED**

Run: `node --test tests/document-links-state.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `document-links-state.js`.

- [ ] **Step 3: Implement validators and store transitions**

Create `document-links-state.js`. Define browser-side `normalizeText`, `unicodeLength`, `directoryNameKey`, `validateDirectoryName`, and `validateDraft` with the same contracts as the server. Implement immutable snapshots so subscribers cannot mutate internal arrays accidentally.

Use this request wrapper and load sequence:

```js
export async function documentApiRequest(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...options,
    headers: options.body
      ? { 'Content-Type': 'application/json', ...(options.headers || {}) }
      : options.headers,
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) window.dispatchEvent(new CustomEvent('auth-required'));
  if (data.code === 'PASSWORD_CHANGE_REQUIRED') {
    window.dispatchEvent(new CustomEvent('password-change-required'));
  }
  if (!response.ok) {
    const exception = new Error(data.message || '请求失败');
    exception.code = data.code;
    exception.fields = data.fields || {};
    throw exception;
  }
  return data;
}
```

`load()` must request `/api/document-directories` then `/api/document-links`, set `status: 'ready'`, and avoid another request after success. All successful mutations must update the matching collection, recalculate directory counts from documents, apply the required stable sort, and clear the editor. Directory name conflicts are validated client-side and still handled from server errors.

- [ ] **Step 4: Verify the client store**

Run:

```powershell
node --test tests/document-links-state.test.js
node --check document-links-state.js
```

Expected: all client-state tests pass and syntax check exits 0.

- [ ] **Step 5: Commit the client-state task**

```powershell
git add -- document-links-state.js tests/document-links-state.test.js
git commit -m "feat: add document links client state"
```

---

### Task 5: Document UI, inline editing, directory management, and confirmation dialogs

**Files:**
- Create: `document-links-ui.js`
- Create: `tests/document-links-ui.test.js`
- Modify: `index.html`

**Interfaces:**
- Consumes: `createDocumentLinksStore` and the IDs `documentsContent`, `directoryManageBtn`, `directoryModal`, `directoryModalBody`, `directoryCreateForm`, `directoryNameInput`, `directoryModalError`, `confirmModal`, `confirmTitle`, `confirmMessage`, `confirmAcceptBtn`, and `confirmCancelBtn`.
- Produces: `initDocumentLinks(root = document)`, `loadDocumentLinks()`, and `resetDocumentLinks()`; assigns `window.__documentLinksInit` and `window.__documentLinksReset`.

- [ ] **Step 1: Write failing UI behavior tests using a minimal fake document**

Create `tests/document-links-ui.test.js`. Implement only the fake element methods used by rendering: `createElement`, `append`, `replaceChildren`, `addEventListener`, `dispatchEvent`, `focus`, `setAttribute`, `classList`, `dataset`, `textContent`, `value`, and `disabled`. Inject a fake store into exported `createDocumentLinksUi({ root, store })` and assert:

1. A description containing `<script>` is assigned to `textContent`; no anchor element is created.
2. Clicking a title calls `beginEdit(id)`; clicking the description does not.
3. Clicking Add calls `beginAdd(directoryId)` and renders title, description, directory inputs plus Save/Cancel.
4. Save updates the draft and calls `saveDraft`; Cancel calls `cancelEdit`.
5. A store save error remains visible while input values remain unchanged.
6. A non-empty directory delete button is disabled and exposes the agreed explanatory title.
7. The confirmation dialog calls the destructive action only after explicit acceptance and returns focus to its trigger.

- [ ] **Step 2: Run UI tests and verify RED**

Run: `node --test tests/document-links-ui.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `document-links-ui.js`.

- [ ] **Step 3: Replace document placeholder and add semantic modal markup**

In `index.html`, replace `<section class="panel documents-placeholder">功能占位</section>` with:

```html
<div id="documentsContent" class="document-directories" aria-live="polite"></div>
```

Add `directoryManageBtn` beside `weekNav`, initially hidden:

```html
<button class="btn btn-primary" id="directoryManageBtn" type="button" hidden>目录管理</button>
```

Before the scripts, add two dialogs using the existing `.account-modal`/`.account-dialog` visual language:

```html
<div class="account-modal hidden" id="directoryModal" role="dialog" aria-modal="true" aria-labelledby="directoryModalTitle">
  <div class="account-dialog">
    <h2 id="directoryModalTitle">目录管理</h2>
    <form id="directoryCreateForm" class="directory-create-form">
      <input class="input" id="directoryNameInput" maxlength="20" placeholder="输入目录名称" required>
      <button class="btn btn-primary" type="submit">新增目录</button>
    </form>
    <div class="account-error" id="directoryModalError" aria-live="polite"></div>
    <div id="directoryModalBody" class="directory-manager-list"></div>
    <div class="account-actions"><button class="btn btn-ghost" id="directoryModalCloseBtn" type="button">关闭</button></div>
  </div>
</div>
<div class="account-modal hidden" id="confirmModal" role="alertdialog" aria-modal="true" aria-labelledby="confirmTitle" aria-describedby="confirmMessage">
  <div class="account-dialog account-dialog--small">
    <h2 id="confirmTitle">确认删除</h2>
    <p id="confirmMessage"></p>
    <div class="account-actions">
      <button class="btn btn-ghost" id="confirmCancelBtn" type="button">取消</button>
      <button class="btn btn-danger" id="confirmAcceptBtn" type="button">删除</button>
    </div>
  </div>
</div>
```

- [ ] **Step 4: Add final document styles and remove legend styles/markup**

Delete `.documents-placeholder`, `.legend`, `.legend-item`, `.legend-color`, and `.legend-color-*` rules and remove the full `<div class="legend" id="todoLegend">...</div>` block. Change `.app-footer` to `justify-content: flex-end` so the account controls remain right-aligned.

Add focused styles for `.document-directories`, `.document-directory`, `.document-directory__header`, `.document-row`, `.document-row__title`, `.document-row__description`, `.document-row__actions`, `.document-editor`, `.document-editor__fields`, `.field-error`, `.character-count`, `.document-empty`, `.directory-create-form`, `.directory-manager-list`, and `.directory-manager-row`. Desktop `.document-row` uses `grid-template-columns: minmax(120px, 220px) minmax(0, 1fr) auto`; at `max-width: 768px`, use one column and allow actions to wrap. Use only existing CSS variables and existing button/input conventions.

- [ ] **Step 5: Implement the DOM module**

Create `document-links-ui.js` and export `createDocumentLinksUi({ root, store })`. Build all user-provided content with `createElement` plus `textContent`/`value`; never use `innerHTML` for directory names, titles, or descriptions.

Required render functions and exact responsibilities:

```js
function renderStatus(state) {
  // Render “正在加载…”, a load error plus retry button, or “暂无目录”.
}
function renderDirectory(directory, state) {
  // Render header/Add, then the active editor or sorted document rows; render “暂无文档链接” when empty.
}
function renderDocumentRow(document) {
  // Render title as a button, description as a plain div using textContent, and a delete button.
}
function renderEditor(editor, directories) {
  // Render title/description/select, Unicode counts, field/request errors, Save, and Cancel.
}
function renderDirectoryManager(state) {
  // Render each name/count, inline rename controls, and disabled non-empty deletion.
}
function openConfirmation({ title, message, trigger, action }) {
  // Set dialog copy, focus Cancel, run action only from Accept, close on Cancel/Escape, and restore trigger focus.
}
```

Bind `input` events to `store.updateDraft`; bind title click only to `store.beginEdit`; do not attach a click handler to descriptions. The character count must use `[...value].length`. Disable other Add/title controls while `state.editor` exists and show `请先保存或取消当前编辑` in the active row error region when attempted.

The module must subscribe once, render the initial state, expose lazy `load()`, and implement `reset()` by closing both dialogs and calling `store.reset()`. `Escape` closes the topmost dialog and discards only unsaved directory-modal input/rename state.

- [ ] **Step 6: Verify UI behavior and static safety**

Run:

```powershell
node --test tests/document-links-ui.test.js
node --check document-links-ui.js
Select-String -LiteralPath document-links-ui.js -Pattern 'textContent','toLocaleLowerCase','openConfirmation'
```

Expected: all UI tests pass, syntax exits 0, and all three safety/behavior hooks are present.

- [ ] **Step 7: Commit the UI task**

```powershell
git add -- document-links-ui.js tests/document-links-ui.test.js
git add -p -- index.html
git diff --cached -- index.html
git commit -m "feat: add document links interface"
```

Accept only document-panel, dialog, legend-removal, and document-style hunks from `index.html`. Confirm the cached diff contains no unrelated reminder or user-owned changes.

---

### Task 6: Tab/auth integration, build wiring, and complete verification

**Files:**
- Modify: `feature-tabs.js`
- Modify: `tests/feature-tabs.test.js`
- Modify: `tests/feature-tabs-markup.test.js`
- Modify: `auth-ui.js`
- Modify: `scripts/prepare-pages.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `directoryManageBtn`, `window.__documentLinksInit`, and `window.__documentLinksReset` from Task 5.
- Produces: lazy document initialization when the document tab activates and account-safe reset when login view returns.

- [ ] **Step 1: Update failing tab-controller tests first**

Change the setup in `tests/feature-tabs.test.js` to provide `directoryManageBtn` and `onDocumentsActivated`, and remove `todoLegend`. Assert:

```js
assert.equal(ui.weekNav.hidden, false);
assert.equal(ui.directoryManageBtn.hidden, true);

ui.documentsTab.dispatch('click');
assert.equal(ui.weekNav.hidden, true);
assert.equal(ui.directoryManageBtn.hidden, false);
assert.equal(ui.documentsActivatedCount, 1);

ui.todoTab.dispatch('click');
ui.documentsTab.dispatch('click');
assert.equal(ui.documentsActivatedCount, 2);
```

Update `tests/feature-tabs-markup.test.js` to require the final document container, management button, both dialogs, module scripts, no `id="todoLegend"`, and unchanged `footer-right` account controls. Remove the old `功能占位` expectation.

- [ ] **Step 2: Run integration tests and verify RED**

Run:

```powershell
node --test tests/feature-tabs.test.js tests/feature-tabs-markup.test.js
```

Expected: FAIL because the controller still requires `todoLegend` and build wiring does not yet include the new modules.

- [ ] **Step 3: Update the tab controller**

Change the signature to:

```js
export function createFeatureTabs({
  tabs, panels, weekNav, directoryManageBtn, onDocumentsActivated = () => {},
})
```

Inside `activate(tabName)`, retain the current ARIA/panel logic, then:

```js
const todoActive = tabName === 'todo';
weekNav.hidden = !todoActive;
directoryManageBtn.hidden = todoActive;
if (!todoActive) onDocumentsActivated();
```

In `initFeatureTabs`, pass `root.getElementById('directoryManageBtn')` and `() => window.__documentLinksInit?.()`. Do not reference `todoLegend` anywhere.

- [ ] **Step 4: Wire authentication reset/init**

In `auth-ui.js`, add `window.__documentLinksReset?.()` in `showLogin()` next to `D1Storage.reset()`. Add `window.__documentLinksReady?.(user)` in `showApp(user)` before todo initialization. `document-links-ui.js` must define this hook; it records the current user ID without fetching and resets first if the user ID changed.

Ensure an auth failure or account switch clears directories, documents, editor state, modal state, and the `loaded` flag.

- [ ] **Step 5: Wire scripts and build output**

In `index.html`, load in dependency order:

```html
<script type="module" src="document-links-ui.js"></script>
<script type="module" src="feature-tabs.js"></script>
```

Add `document-links-state.js` and `document-links-ui.js` to `staticFiles` in `scripts/prepare-pages.mjs`.

Change the `check` script in `package.json` to include:

```json
"check": "node --check auth-ui.js && node --check d1-storage.js && node --check feature-tabs.js && node --check document-links-state.js && node --check document-links-ui.js && node --check functions/api/document-directories.js && node --check functions/api/document-links.js && node --check worker/reminder.js"
```

- [ ] **Step 6: Run focused integration checks**

Run:

```powershell
node --test tests/feature-tabs.test.js tests/feature-tabs-markup.test.js tests/document-links-state.test.js tests/document-links-ui.test.js
npm.cmd run check
npm.cmd run build
Test-Path .pages-dist\document-links-state.js
Test-Path .pages-dist\document-links-ui.js
Select-String -LiteralPath .pages-dist\index.html -Pattern 'directoryManageBtn','documentsContent','confirmModal','document-links-ui.js'
```

Expected: focused tests pass; syntax/build exit 0; both `Test-Path` calls print `True`; all four markup patterns are found.

- [ ] **Step 7: Run the full automated suite**

Run: `npm.cmd test`

Expected: every existing and new test passes with 0 failures.

- [ ] **Step 8: Apply migration to a local D1 database and exercise API smoke cases**

Run with the workspace Wrangler version:

```powershell
npx.cmd wrangler d1 migrations apply xiaohutodo-db --local
npx.cmd wrangler pages dev .pages-dist --d1 DB=xiaohutodo-db
```

In the authenticated local page, verify that first directory load returns the three initial directories, a document can be created/moved/deleted, a non-empty directory deletion returns conflict, and deleting all directories does not recreate them after refresh. Stop the local server after verification.

Expected: migrations apply without SQL errors and all smoke cases behave as specified.

- [ ] **Step 9: Perform desktop and narrow-screen visual verification**

Using the in-app browser at a normal desktop width and at 375px:

1. To-do List shows week controls; Document Links shows only Directory Management on the right.
2. The bottom-left legend is absent everywhere; account controls remain right-aligned and functional.
3. Directory cards match the existing dark design system and initial order.
4. Add creates an editor at the directory top; title, description, and directory are editable.
5. Description text can be partially selected and copied; it is not clickable.
6. Moving a document places it in the target directory without changing its relative creation-time ordering.
7. Both deletion flows use the custom dialog; non-empty directory deletion is disabled with an explanation.
8. Loading, retry, empty-directory, and no-directory states render without layout jumps.
9. At 375px, rows stack vertically without overflow or overlapping buttons.
10. Keyboard focus is visible; Escape and dialog focus return behave correctly; no console errors occur.

Expected: all ten checks pass. Record any defect, add a failing automated test where feasible, fix it, and rerun the relevant checks before proceeding.

- [ ] **Step 10: Confirm the final diff is scoped and commit integration**

Run:

```powershell
git status --short
git diff --check
git diff -- feature-tabs.js tests/feature-tabs.test.js tests/feature-tabs-markup.test.js auth-ui.js scripts/prepare-pages.mjs package.json index.html schema.sql
```

Confirm that unrelated pre-existing changes are preserved and not staged. Then:

```powershell
git add -- feature-tabs.js tests/feature-tabs.test.js tests/feature-tabs-markup.test.js auth-ui.js scripts/prepare-pages.mjs
git add -p -- package.json
git diff --cached -- package.json
git commit -m "feat: integrate document links workflow"
```

Accept only the `check` script hunk from `package.json`; do not stage unrelated desktop or reminder configuration. If Task 5 left an intended `index.html` document-link hunk unstaged because it overlapped a user hunk, stage only that exact hunk here with `git add -p -- index.html` and review `git diff --cached -- index.html` before committing.

- [ ] **Step 11: Apply verification-before-completion**

Run fresh commands after the final commit:

```powershell
npm.cmd test
npm.cmd run check
npm.cmd run build
git status --short
```

Expected: tests, checks, and build exit 0. `git status --short` may show the user's known unrelated working-tree changes, but none of the document-link implementation files should remain unintentionally unstaged.
