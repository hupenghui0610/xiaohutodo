# Tab Panel Visibility Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure exactly one main Tab panel is visually rendered at a time and make the footer legend visible only for To-do List while account controls remain visible for every Tab.

**Architecture:** Keep the two existing `tabpanel` elements and the existing feature-tab controller. Add an explicit CSS override for hidden `.sections` elements, identify the footer legend as a To-do List-associated region, and let the same `activate()` function update panel, week-navigation, and legend visibility together.

**Tech Stack:** Static HTML/CSS, browser-native ES modules and DOM APIs, Node.js built-in test runner, existing Cloudflare Pages build/deploy flow.

## Global Constraints

- To-do List owns the complete unlimited, weekly, and daily todo areas.
- Documents owns only the `功能占位` panel in this version.
- Exactly one main panel may be visually displayed at a time.
- The week navigation and footer-left legend are visible only for To-do List.
- Footer-right account controls remain visible for every Tab.
- Preserve the existing 18px Tab typography, `|` divider, keyboard behavior, todo data, and account behavior.
- Preserve the user's unrelated `index.html` working-tree change at `.day-header { margin-bottom: 8px; }` and do not include it in the feature commit.

---

### Task 1: Enforce visual panel exclusivity and footer ownership

**Files:**
- Modify: `tests/feature-tabs-markup.test.js`
- Modify: `tests/feature-tabs.test.js`
- Modify: `index.html`
- Modify: `feature-tabs.js`

**Interfaces:**
- `createFeatureTabs({ tabs, panels, weekNav, todoLegend })` consumes a new `todoLegend` element and sets its `hidden` property alongside `weekNav`.
- `initFeatureTabs(root)` resolves `todoLegend` by ID.
- CSS selector `.sections[hidden]` always computes to `display: none`.
- Footer-right `.footer-right` remains outside all conditional elements.

- [ ] **Step 1: Add failing regression tests**

In `tests/feature-tabs-markup.test.js`, add assertions that the page contains the explicit hidden selector, the legend ID, and the account controls outside the legend:

```js
test('hidden tab panels cannot be displayed by the sections layout rule', () => {
  assert.match(html, /\.sections\[hidden\]\s*\{\s*display:\s*none;/);
});

test('footer legend is todo-specific while account controls remain common', () => {
  assert.match(html, /<div class="legend" id="todoLegend">/);
  assert.match(html, /<\/div>\s*<div class="footer-right">[\s\S]*id="currentAccount"/);
});
```

In `tests/feature-tabs.test.js`, add `todoLegend` to `setup()`, pass it to the controller, return it, and extend the two behavior tests:

```js
const todoLegend = new FakeElement();

createFeatureTabs({
  tabs: [todoTab, documentsTab],
  panels: { todo: todoPanel, documents: documentsPanel },
  weekNav,
  todoLegend,
});
```

Default assertion:

```js
assert.equal(ui.todoLegend.hidden, false);
```

Documents assertion:

```js
assert.equal(ui.todoLegend.hidden, true);
```

Todo restoration assertion:

```js
assert.equal(ui.todoLegend.hidden, false);
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```powershell
node --test tests/feature-tabs.test.js tests/feature-tabs-markup.test.js
```

Expected: FAIL because `.sections[hidden]`, `id="todoLegend"`, and controller legend handling do not exist.

- [ ] **Step 3: Add the explicit CSS visibility rule and footer legend ID**

Immediately after `.sections` in `index.html`, add:

```css
    .sections[hidden] {
      display: none;
    }
```

Change the footer legend opening tag to:

```html
      <div class="legend" id="todoLegend">
```

Do not move or wrap `.footer-right`.

- [ ] **Step 4: Make legend visibility follow the active Tab**

Change the controller signature and `activate()` body in `feature-tabs.js`:

```js
export function createFeatureTabs({ tabs, panels, weekNav, todoLegend }) {
  function activate(tabName) {
    tabs.forEach((tab) => {
      const selected = tab.dataset.featureTab === tabName;
      tab.setAttribute('aria-selected', String(selected));
      tab.setAttribute('tabindex', selected ? '0' : '-1');
    });

    Object.entries(panels).forEach(([name, panel]) => {
      panel.hidden = name !== tabName;
    });
    const todoActive = tabName === 'todo';
    weekNav.hidden = !todoActive;
    todoLegend.hidden = !todoActive;
  }
```

Add to `initFeatureTabs(root)`:

```js
    todoLegend: root.getElementById('todoLegend'),
```

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```powershell
node --test tests/feature-tabs.test.js tests/feature-tabs-markup.test.js
```

Expected: all feature-tab tests pass with 0 failures.

- [ ] **Step 6: Run full verification and build contract checks**

Run:

```powershell
npm.cmd test
npm.cmd run check
npm.cmd run build
```

Then verify `.pages-dist/index.html` contains `.sections[hidden]`, `id="todoLegend"`, `font-size: 18px`, and the Tab divider.

Expected: 0 test failures, all syntax checks exit 0, build exits 0, and all four output markers exist.

- [ ] **Step 7: Commit only the fix files**

Temporarily remove the user's unrelated `.day-header` line from the working tree, then:

```powershell
git add -- index.html feature-tabs.js tests/feature-tabs.test.js tests/feature-tabs-markup.test.js
git commit -m "fix: isolate primary tab content"
```

Restore the user's `.day-header { margin-bottom: 8px; }` line immediately after the commit.

Expected: the commit contains exactly four files and the user's pre-existing line remains as an unstaged `index.html` change.

- [ ] **Step 8: Deploy and verify production**

Build with `DEPLOY_VERSION` set to the new commit SHA, deploy `.pages-dist` to Cloudflare Pages project `xiaohutodo` on branch `main`, then fetch both the production domain and deployment-specific URL.

Expected production checks:

1. Both URLs return HTTP 200.
2. HTML contains `.sections[hidden] { display: none; }` and `id="todoLegend"`.
3. HTML still contains the 18px Tab style and `|` divider.
4. `feature-tabs.js` contains `todoLegend.hidden = !todoActive`.
