# Virtual Gift Code Daily Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing Cloudflare reminder Worker to send a daily 09:00 Feishu post reporting available virtual gift codes by course, then deploy it and send today's report once.

**Architecture:** Keep the feature inside `worker/reminder.js`, following the existing reminder Worker patterns. Add isolated functions for Feishu data access, aggregation, post construction, message delivery, and gift-report orchestration; reuse the existing D1 recipient binding and delivery table for idempotency. The scheduled handler will run the existing todo reminder on all configured slots and the gift report only at 09:00 Asia/Shanghai.

**Tech Stack:** JavaScript ES modules, Node.js built-in test runner, Cloudflare Workers, Cloudflare D1, Wrangler, Feishu Open API.

## Global Constraints

- The job runs on the server through the existing Cloudflare Worker; it must not create a Codex local automation.
- Run at 09:00 Asia/Shanghai using the existing `0 1 * * *` Cron trigger.
- Data source is Base app token `RZVbbE34jaTP2xsHh3Tcnv03n4d`, table `tbl2LVOGDfDhPqyL`.
- Count rows where `卡号` is non-empty and `申请人` is empty, grouped by `课程名称`.
- The post title is `虚拟赠品兑换码数量`; include Shanghai data time and one `课程名称：剩余XX个` line per course, with no total row.
- Deliver to the enabled `admin_hupenghui` recipient already stored in `feishu_reminder_recipient`.
- Never commit either Feishu App Secret; store them only as Cloudflare Secrets.
- Preserve all unrelated dirty-worktree changes.

---

### Task 1: Add gift data aggregation and post tests

**Files:**
- Modify: `tests/reminder.test.js`
- Modify: `worker/reminder.js`

**Interfaces:**
- Produces: `aggregateGiftCodeRows(items): Array<{ course: string, available: number }>`
- Produces: `buildGiftReportPost({ dataTime, rows }): object`
- Produces: `shanghaiReportTime(date): string`

- [ ] **Step 1: Write failing aggregation and post tests**

Add tests importing the three interfaces above. The aggregation test must pass Feishu text-array values such as `[{ text: '火花思维', type: 'text' }]`, combine duplicate course rows, and return rows sorted by course name. The post test must assert the title, data-time text, each course line, and absence of `合计`. Add an empty-state test asserting `暂无可用兑换码`.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test tests/reminder.test.js`

Expected: FAIL because the new exports do not exist.

- [ ] **Step 3: Implement the minimal pure functions**

In `worker/reminder.js`, add:

```js
export function shanghaiReportTime(date = new Date()) { /* YYYY年MM月DD日 HH:mm */ }
export function aggregateGiftCodeRows(items) { /* normalize course text and count */ }
export function buildGiftReportPost({ dataTime, rows }) { /* Feishu post */ }
```

Use the agreed title, data-time line, separator, and one course line per row. Do not append a summary row.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `node --test tests/reminder.test.js`

Expected: all tests pass.

### Task 2: Add paginated Base reading tests and implementation

**Files:**
- Modify: `tests/reminder.test.js`
- Modify: `worker/reminder.js`

**Interfaces:**
- Produces: `loadGiftCodeRows(env, fetchImpl = fetch): Promise<Array<{ course: string, available: number }>>`
- Consumes env keys: `GIFT_BASE_APP_ID`, `GIFT_BASE_APP_SECRET`, `GIFT_BASE_APP_TOKEN`, `GIFT_BASE_TABLE_ID`

- [ ] **Step 1: Write failing pagination test**

Add a test with a deterministic `fetchImpl` that returns a data-app token followed by two search pages. Assert that the search request filter contains `卡号/isNotEmpty` and `申请人/isEmpty`, the second request carries the returned `page_token`, and the final aggregation includes both pages.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test tests/reminder.test.js`

Expected: FAIL because `loadGiftCodeRows` does not exist.

- [ ] **Step 3: Implement token retrieval and pagination**

Add a dedicated token request using the data-app credentials, then POST to:

```text
/bitable/v1/apps/{app_token}/tables/{table_id}/records/search?page_size=500
```

Send `field_names` for `课程名称`, `卡号`, and `申请人`, plus the required two-condition filter. Follow `has_more` and URL-encoded `page_token` until complete, then call `aggregateGiftCodeRows`.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `node --test tests/reminder.test.js`

Expected: all tests pass.

### Task 3: Add post sending, orchestration, and schedule tests

**Files:**
- Modify: `tests/reminder.test.js`
- Modify: `worker/reminder.js`

**Interfaces:**
- Produces: `isGiftReportSlot(date): boolean`
- Produces: `runGiftReport(env, scheduledDate = new Date()): Promise<object>`
- Extends the existing Feishu sender to accept `msg_type` and structured content.

- [ ] **Step 1: Write failing scheduling and orchestration tests**

Add tests proving 01:00 UTC is the 09:00 Shanghai gift slot while the 12:30 and 17:00 slots are false. Add an orchestration test using a minimal fake D1 binding and injected HTTP responses to assert the post payload is addressed to the stored `open_id` and the delivery slot is distinct from the todo reminder slot.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test tests/reminder.test.js`

Expected: FAIL for missing scheduling/orchestration behavior.

- [ ] **Step 3: Implement post sending and gift orchestration**

Reuse the existing `post` message sender. Implement `runGiftReport` to load the enabled recipient, reserve an idempotent slot such as `gift-report-09:00`, read data, build the post, send it, and finish the delivery as `sent` or `failed`.

Update the scheduled handler to launch the todo reminder and, only for the 09:00 Shanghai slot, the gift report as independent `waitUntil` work so one failure does not suppress the other.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `node --test tests/reminder.test.js tests/feishu-pages-callback.test.js`

Expected: all selected tests pass.

### Task 4: Configure and document production deployment

**Files:**
- Modify: `wrangler.reminder.toml`
- Modify: `docs/feishu-reminder.md`

**Interfaces:**
- Adds vars: `GIFT_BASE_APP_ID`, `GIFT_BASE_APP_TOKEN`, `GIFT_BASE_TABLE_ID`
- Adds secret: `GIFT_BASE_APP_SECRET`

- [ ] **Step 1: Add non-secret Worker variables**

Set the data App ID, Base app token, and table ID under `[vars]`. Do not add either App Secret.

- [ ] **Step 2: Document the gift report and secret command**

Update `docs/feishu-reminder.md` with the 09:00 report behavior, statistic definition, and Wrangler command for `GIFT_BASE_APP_SECRET`. Keep the existing bot secret command.

- [ ] **Step 3: Run syntax and full test verification**

Run:

```powershell
npm.cmd run check
node --test
```

Expected: both commands exit 0 with zero test failures.

### Task 5: Deploy and send today's report

**Files:**
- No committed source files; Cloudflare configuration and a one-time operational send only.

**Interfaces:**
- Uses Wrangler secrets `FEISHU_APP_SECRET` and `GIFT_BASE_APP_SECRET`.
- Uses the production D1 recipient for `admin_hupenghui`.

- [ ] **Step 1: Store both secrets without committing them**

Run Wrangler secret commands for `FEISHU_APP_SECRET` and `GIFT_BASE_APP_SECRET`, supplying values through stdin so they do not enter repository files.

- [ ] **Step 2: Deploy the reminder Worker**

Run: `npm.cmd run deploy:reminder`

Expected: Wrangler reports a successful deployment and the three existing Cron triggers, including `0 1 * * *`.

- [ ] **Step 3: Verify the deployed Worker health**

Request: `https://xiaohutodo-reminder.hupenghui1993.workers.dev/health`

Expected JSON: `{ "ok": true, "service": "xiaohutodo-reminder" }`.

- [ ] **Step 4: Read the bound recipient and perform one operational send**

Use a read-only Wrangler D1 query to obtain the enabled `open_id` for `admin_hupenghui`. Run a one-time local API invocation using the same production data query and post format, and send exactly one message to that `open_id` for today's Shanghai data time.

- [ ] **Step 5: Verify the operational send response**

Expected: Feishu returns `code: 0` and a non-empty `message_id`. Report that message ID without exposing tokens or App Secrets.

- [ ] **Step 6: Review final diff and commit only feature-owned files**

Run `git diff --check`, the focused tests, and `git status --short`. Stage only the feature hunks in `worker/reminder.js`, `tests/reminder.test.js`, `wrangler.reminder.toml`, and `docs/feishu-reminder.md`; preserve unrelated user changes.
