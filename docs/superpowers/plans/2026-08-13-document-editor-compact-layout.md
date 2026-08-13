# Document Editor Compact Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将文档新增/编辑器改成紧凑的桌面两行布局，并保持移动端单列和现有行为不变。

**Architecture:** 只调整 `renderEditor` 的语义容器 class 与 `index.html` 中对应 CSS。客户端状态、API、数据库和字段事件保持原样。

**Tech Stack:** 原生 JavaScript DOM、HTML/CSS、Node.js test runner。

## Global Constraints

- 桌面第一行标题与所属目录，第二行描述独占整行。
- 768px 以下全部单列且无横向滚动。
- 不改变字段、校验、保存、取消和数据逻辑。
- 保留工作区其他未提交改动。

---

### Task 1: 编辑器 DOM 与样式

**Files:**
- Modify: `document-links-ui.js`
- Modify: `index.html`
- Test: `tests/document-links-ui.test.js`
- Test: `tests/feature-tabs-markup.test.js`

**Interfaces:**
- Consumes: 现有 `renderEditor(editor, directories)`。
- Produces: `.document-editor__top-fields`、`.document-field--description`、`.document-editor__footer` 紧凑结构。

- [ ] **Step 1: 添加失败测试**

断言编辑器包含顶部字段组，标题和目录在其中；描述带独占 class；错误和按钮位于 footer。静态测试匹配两列 grid、描述高度、footer 对齐和移动端单列规则。

- [ ] **Step 2: 验证 RED**

Run: `node --test tests/document-links-ui.test.js tests/feature-tabs-markup.test.js`

Expected: 新 class 和样式规则不存在。

- [ ] **Step 3: 实现紧凑结构和 CSS**

在 `renderEditor` 中将标题与目录追加到 `.document-editor__top-fields`，描述追加到 `.document-field--description`，错误和操作按钮包入 `.document-editor__footer`。CSS 使用 `grid-template-columns: minmax(0, 2fr) minmax(180px, 1fr)`，textarea `min-height: 64px`，编辑器 `padding: 14px`、`gap: 8px`，footer 横向排列并允许换行。移动端把 top fields 改为一列。

- [ ] **Step 4: 验证 GREEN 和全量构建**

Run: `npm.cmd test; npm.cmd run check; npm.cmd run build; git diff --check`

Expected: 全部退出 0。

- [ ] **Step 5: 桌面与 375px 浏览器验证并提交**

检查新增和编辑两种状态的高度、对齐、字数、错误、按钮以及无横向滚动。仅暂存本任务文件和 `index.html` 精确 CSS 片段后提交。

---

### Task 2: 隔离部署与线上验证

**Files:**
- Deploy: 已提交版本生成的隔离归档。

**Interfaces:**
- Consumes: Task 1 提交。
- Produces: 正式 Pages 上已验证的紧凑编辑器。

- [ ] **Step 1: 从提交生成隔离部署包并构建**
- [ ] **Step 2: 部署 Pages（无数据库迁移）**
- [ ] **Step 3: 在线验证桌面/375px、新增/编辑及控制台**
- [ ] **Step 4: 清理隔离部署包并报告正式地址**
