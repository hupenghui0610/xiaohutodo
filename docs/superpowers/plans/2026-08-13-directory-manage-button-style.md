# Directory Management Button Style Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将目录管理按钮改为与周时间切换器一致的低调深色描边胶囊样式。

**Architecture:** 为按钮添加独立类名并在 `index.html` 中定义局部 CSS；保留现有 ID、事件绑定和显示逻辑不变。

**Tech Stack:** HTML/CSS、Node.js test runner、Cloudflare Pages。

## Global Constraints

- 仅改变目录管理按钮视觉。
- 不改变目录弹窗、数据或交互行为。
- 保留工作区其他未提交改动。

---

### Task 1: 按钮样式与部署

**Files:**
- Modify: `index.html`
- Test: `tests/feature-tabs-markup.test.js`
- Deploy: Cloudflare Pages production

**Interfaces:**
- Consumes: `#directoryManageBtn`、`.week-nav` 现有样式。
- Produces: `.directory-manage-btn` 默认与悬停样式。

- [x] **Step 1: 写入失败测试**

断言按钮使用独立类，并具有时间切换器同款背景、边框、阴影及浅蓝悬停文字。

- [x] **Step 2: 验证 RED**

Run: `node --test tests/feature-tabs-markup.test.js`

Expected: 独立类和样式不存在，测试失败。

- [x] **Step 3: 最小实现**

将按钮类从 `btn btn-primary` 改为 `btn directory-manage-btn`，加入局部默认和悬停样式。

- [x] **Step 4: 验证 GREEN**

Run: `npm.cmd test; npm.cmd run check; npm.cmd run build; git diff --check`

Expected: 全部退出 0。

- [ ] **Step 5: 精确提交、隔离部署并在线验收**

从本次提交生成隔离部署包，检查桌面、375px、悬停和控制台。
