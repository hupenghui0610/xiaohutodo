# Document Editor Corner Hierarchy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将文档编辑器字段从胶囊圆角改为 6px 小圆角，同时保留外框 10px 和按钮胶囊圆角。

**Architecture:** 通过 `.document-editor .input` 局部覆盖通用 `.input` 的胶囊圆角，不影响页面其他表单。使用静态样式测试锁定三个层级。

**Tech Stack:** HTML/CSS、Node.js test runner、Cloudflare Pages。

## Global Constraints

- 仅修改文档编辑器视觉样式。
- 编辑器外框为 10px，字段为 6px，按钮为 999px。
- 不改变数据、校验、保存、取消或响应式布局。
- 保留工作区其他未提交改动。

---

### Task 1: 圆角层级与部署

**Files:**
- Modify: `index.html`
- Test: `tests/feature-tabs-markup.test.js`
- Deploy: Cloudflare Pages production

**Interfaces:**
- Consumes: `.document-editor`、`.input`、`.btn` 现有样式。
- Produces: `.document-editor .input { border-radius: 6px; }` 局部覆盖。

- [x] **Step 1: 写入失败测试**

断言编辑器外框使用 `var(--radius-md)`、编辑器字段使用 `6px`、通用按钮继续使用 `999px`。

- [x] **Step 2: 验证 RED**

Run: `node --test tests/feature-tabs-markup.test.js`

Expected: 字段 6px 规则不存在，测试失败。

- [x] **Step 3: 最小实现**

在文档编辑器 CSS 中加入：

```css
.document-editor .input { border-radius: 6px; }
```

并让描述框继承该局部规则。

- [x] **Step 4: 验证 GREEN**

Run: `npm.cmd test; npm.cmd run check; npm.cmd run build; git diff --check`

Expected: 全部退出 0。

- [ ] **Step 5: 提交、部署及线上检查**

从本次提交生成隔离部署包，部署生产环境；检查新增、编辑、375px 和控制台。
