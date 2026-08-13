# 文档目录顺序调整 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在目录管理弹窗中通过上移/下移按钮调整账号级一级目录顺序并立即持久化。

**Architecture:** D1 为目录保存 `sort_order`，Pages Function 在账号范围内原子交换相邻目录的顺序值并返回完整有序列表。客户端 Store 用服务端列表替换本地目录集合，UI 根据边界状态渲染和禁用按钮。

**Tech Stack:** Cloudflare D1 SQL migrations、Pages Functions、原生 JavaScript、Node.js test runner、HTML/CSS。

## Global Constraints

- 不引入拖拽或单独的保存顺序步骤。
- 第一项不能上移，最后一项不能下移。
- 新增目录默认追加到当前账号目录末尾。
- 顺序数据和所有写操作必须按账号隔离。
- 失败时保留当前顺序并在目录弹窗内显示错误。
- 保留工作区中与飞书、提醒、桌面端相关的未提交改动。

---

### Task 1: 排序字段、迁移与目录接口

**Files:**
- Create: `migrations/0004_document_directory_order.sql`
- Modify: `schema.sql`
- Modify: `functions/api/document-directories.js`
- Modify: `functions/_lib/document-links.js`
- Modify: `tests/helpers/fake-document-db.js`
- Test: `tests/document-directories-api.test.js`

**Interfaces:**
- Consumes: 当前账号 `userId` 与现有目录 CRUD。
- Produces: 目录响应中的 `sortOrder`；`PUT { id, direction: 'up' | 'down' }` 相邻移动操作。

- [ ] **Step 1: 添加失败测试**

在 API 测试中断言列表按 `sort_order` 返回，上移/下移只交换相邻目录，首尾边界返回 `400`，非法方向返回 `400`，其他账号目录返回 `404`，新增目录获得最大顺序值加一。

- [ ] **Step 2: 验证 RED**

Run: `node --test tests/document-directories-api.test.js`

Expected: 因响应缺少 `sortOrder`、移动请求仍按改名处理而失败。

- [ ] **Step 3: 实现迁移与接口**

迁移增加 `sort_order INTEGER NOT NULL DEFAULT 0`，用窗口函数按 `user_id` 分组并按 `created_at, id` 回填；创建 `(user_id, sort_order, created_at, id)` 索引。初始化绑定 `index`，新增目录查询 `COALESCE(MAX(sort_order), -1) + 1`。`PUT` 在带 `direction` 时读取账号完整有序列表，寻找相邻项并通过 `db.batch` 交换两个值；普通改名路径保持不变。

- [ ] **Step 4: 验证 GREEN**

Run: `node --test tests/document-directories-api.test.js`

Expected: 全部通过。

- [ ] **Step 5: 提交后端任务**

只暂存上述后端、迁移和测试文件；`schema.sql` 只选择性暂存排序字段与索引片段。

---

### Task 2: 客户端状态与弹窗操作

**Files:**
- Modify: `document-links-state.js`
- Modify: `document-links-ui.js`
- Modify: `index.html`
- Test: `tests/document-links-state.test.js`
- Test: `tests/document-links-ui.test.js`

**Interfaces:**
- Consumes: `PUT /api/document-directories` 的 `{ id, direction }` 与 `{ data: { directories } }` 响应。
- Produces: `store.moveDirectory(id, direction)`；目录行中的上移/下移按钮。

- [ ] **Step 1: 添加失败测试**

Store 测试断言移动请求、成功列表替换、失败不改顺序、reset 后丢弃旧请求。UI 测试断言首项上移禁用、末项下移禁用、中间项双按钮可用、点击调用正确参数、请求失败显示弹窗错误。

- [ ] **Step 2: 验证 RED**

Run: `node --test tests/document-links-state.test.js tests/document-links-ui.test.js`

Expected: `moveDirectory` 不存在且 UI 中没有排序按钮。

- [ ] **Step 3: 实现 Store 与 UI**

Store 捕获 generation，调用移动接口，成功后按服务端列表设置目录并重算文档数，失败向 UI 抛出异常。UI 在目录行信息与改名按钮之间渲染“上移”“下移”，根据索引设置 `disabled` 和说明；请求期间防重复，失败写入 `directoryModalError`。沿用现有按钮、颜色、间距和焦点规范，窄屏允许操作区换行。

- [ ] **Step 4: 验证 GREEN**

Run: `node --test tests/document-links-state.test.js tests/document-links-ui.test.js`

Expected: 全部通过。

- [ ] **Step 5: 提交客户端任务**

只暂存目录排序相关状态、UI、CSS 与测试片段。

---

### Task 3: 完整验证与部署准备

**Files:**
- Modify: `scripts/prepare-pages.mjs`（仅在构建清单需要变化时）
- Test: 全部测试与构建输出

**Interfaces:**
- Consumes: Task 1–2 的完整功能。
- Produces: 可迁移、可部署且经过桌面/窄屏验证的目录排序功能。

- [ ] **Step 1: 完整自动验证**

Run: `npm.cmd test; npm.cmd run check; npm.cmd run build; git diff --check`

Expected: 全部退出 0。

- [ ] **Step 2: 数据库验证**

在独立临时 D1 数据库执行 `schema.sql` 和迁移，确认 `sort_order`、索引、现有目录回填以及新目录末尾追加。

- [ ] **Step 3: 浏览器验证**

验证桌面与 375px：按钮无溢出，首尾禁用正确，连续移动即时同步主页面，错误提示不关闭弹窗，控制台无错误。

- [ ] **Step 4: 范围检查与最终提交**

检查 staged diff 只包含目录排序功能和对应设计/计划，不包含用户现有的飞书、提醒、桌面端改动。
