# Primary Feature Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the main-screen title with first-level “To-do List” and “文档链接” tabs, keep the existing todo view as the default, and show a placeholder document-links view while hiding the week controls.

**Architecture:** Keep the existing single-page application. Add a focused ES module that owns tab state and accessibility behavior, inject the required tab/panel markup and matching styles into `index.html`, and copy the module through the existing Pages build pipeline. Existing todo rendering, persistence, authentication, and footer behavior remain untouched.

**Tech Stack:** Static HTML/CSS, browser-native ES modules and DOM APIs, Node.js built-in test runner (`node:test`), existing Pages preparation script.

## Global Constraints

- Main-screen tabs must be labeled exactly `To-do List` and `文档链接`; “小胡同学” is not shown in the main header.
- The login title must remain exactly `小胡同学To-do List`.
- Both main tabs use the existing 22px title size and the current dark visual system.
- The week navigation is visible only while `To-do List` is active.
- The document-links panel contains only the text `功能占位` in this version.
- The selected tab is runtime-only state; refresh always returns to `To-do List`.
- Do not add routing, third-party dependencies, persistence, or document-link CRUD behavior.
- Do not modify existing todo rendering, storage, editing, deletion, week navigation, authentication, or footer behavior.

## File Map

- Create `feature-tabs.js`: isolated feature-tab controller, keyboard behavior, DOM initialization, and default state.
- Create `tests/feature-tabs.test.js`: behavioral unit tests for click switching, panel/week-nav visibility, ARIA state, and arrow-key focus.
- Create `tests/feature-tabs-markup.test.js`: static integration tests for required labels, semantic markup, placeholder, styling hook, login copy, and build inclusion.
- Modify `index.html`: replace the main title with tab markup, wrap the existing todo sections in a tab panel, add the document placeholder panel, load the controller module, and add visual/responsive styles.
- Modify `scripts/prepare-pages.mjs`: include `feature-tabs.js` in the static files copied to `.pages-dist`.

---

### Task 1: Accessible feature-tab controller

**Files:**
- Create: `tests/feature-tabs.test.js`
- Create: `feature-tabs.js`

**Interfaces:**
- Consumes: DOM-like elements supplied as `{ tabs, panels, weekNav }`; each tab exposes `dataset.featureTab`, `setAttribute`, `addEventListener`, and `focus`.
- Produces: `createFeatureTabs({ tabs, panels, weekNav })` returning `{ activate(tabName) }`, plus `initFeatureTabs(root)` for real document initialization.
- State contract: supported tab names are `todo` and `documents`; `todo` is always activated during initialization.

- [ ] **Step 1: Write the failing controller tests**

Create `tests/feature-tabs.test.js` with a minimal fake element implementation so no DOM dependency is added:

```js
import assert from 'node:assert/strict';
import test from 'node:test';

import { createFeatureTabs } from '../feature-tabs.js';

class FakeElement {
  constructor(featureTab = '') {
    this.dataset = { featureTab };
    this.attributes = new Map();
    this.listeners = new Map();
    this.hidden = false;
    this.focused = false;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name);
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  dispatch(type, event = {}) {
    this.listeners.get(type)?.({ preventDefault() {}, ...event });
  }

  focus() {
    this.focused = true;
  }
}

function setup() {
  const todoTab = new FakeElement('todo');
  const documentsTab = new FakeElement('documents');
  const todoPanel = new FakeElement();
  const documentsPanel = new FakeElement();
  const weekNav = new FakeElement();

  createFeatureTabs({
    tabs: [todoTab, documentsTab],
    panels: { todo: todoPanel, documents: documentsPanel },
    weekNav,
  });

  return { todoTab, documentsTab, todoPanel, documentsPanel, weekNav };
}

test('defaults to the todo tab and exposes only todo controls', () => {
  const ui = setup();

  assert.equal(ui.todoTab.getAttribute('aria-selected'), 'true');
  assert.equal(ui.todoTab.getAttribute('tabindex'), '0');
  assert.equal(ui.documentsTab.getAttribute('aria-selected'), 'false');
  assert.equal(ui.documentsTab.getAttribute('tabindex'), '-1');
  assert.equal(ui.todoPanel.hidden, false);
  assert.equal(ui.documentsPanel.hidden, true);
  assert.equal(ui.weekNav.hidden, false);
});

test('clicking documents switches panels and hides week navigation', () => {
  const ui = setup();

  ui.documentsTab.dispatch('click');

  assert.equal(ui.todoTab.getAttribute('aria-selected'), 'false');
  assert.equal(ui.documentsTab.getAttribute('aria-selected'), 'true');
  assert.equal(ui.todoPanel.hidden, true);
  assert.equal(ui.documentsPanel.hidden, false);
  assert.equal(ui.weekNav.hidden, true);

  ui.todoTab.dispatch('click');
  assert.equal(ui.todoPanel.hidden, false);
  assert.equal(ui.documentsPanel.hidden, true);
  assert.equal(ui.weekNav.hidden, false);
});

test('arrow keys activate and focus the adjacent tab', () => {
  const ui = setup();

  ui.todoTab.dispatch('keydown', { key: 'ArrowRight' });
  assert.equal(ui.documentsTab.focused, true);
  assert.equal(ui.documentsTab.getAttribute('aria-selected'), 'true');

  ui.documentsTab.dispatch('keydown', { key: 'ArrowLeft' });
  assert.equal(ui.todoTab.focused, true);
  assert.equal(ui.todoTab.getAttribute('aria-selected'), 'true');
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run:

```powershell
node --test tests/feature-tabs.test.js
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `feature-tabs.js`, proving the controller does not yet exist.

- [ ] **Step 3: Implement the minimal controller**

Create `feature-tabs.js`:

```js
export function createFeatureTabs({ tabs, panels, weekNav }) {
  function activate(tabName) {
    tabs.forEach((tab) => {
      const selected = tab.dataset.featureTab === tabName;
      tab.setAttribute('aria-selected', String(selected));
      tab.setAttribute('tabindex', selected ? '0' : '-1');
    });

    Object.entries(panels).forEach(([name, panel]) => {
      panel.hidden = name !== tabName;
    });
    weekNav.hidden = tabName !== 'todo';
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => activate(tab.dataset.featureTab));
    tab.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const offset = event.key === 'ArrowRight' ? 1 : -1;
      const nextTab = tabs[(index + offset + tabs.length) % tabs.length];
      activate(nextTab.dataset.featureTab);
      nextTab.focus();
    });
  });

  activate('todo');
  return { activate };
}

export function initFeatureTabs(root = document) {
  const tabs = [...root.querySelectorAll('[data-feature-tab]')];
  return createFeatureTabs({
    tabs,
    panels: {
      todo: root.getElementById('todoPanel'),
      documents: root.getElementById('documentsPanel'),
    },
    weekNav: root.getElementById('weekNav'),
  });
}

if (typeof document !== 'undefined') {
  initFeatureTabs(document);
}
```

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run:

```powershell
node --test tests/feature-tabs.test.js
```

Expected: 3 tests pass, 0 fail.

- [ ] **Step 5: Run syntax validation**

Run:

```powershell
node --check feature-tabs.js
```

Expected: exit code 0 with no output.

- [ ] **Step 6: Commit the isolated controller**

```powershell
git add -- feature-tabs.js tests/feature-tabs.test.js
git commit -m "feat: add accessible feature tab controller"
```

Expected: the commit includes exactly the two listed files.

---

### Task 2: Main-screen tab markup, styling, and Pages integration

**Files:**
- Create: `tests/feature-tabs-markup.test.js`
- Modify: `index.html:78-119`
- Modify: `index.html:896-992`
- Modify: `scripts/prepare-pages.mjs:5-6`

**Interfaces:**
- Consumes: `initFeatureTabs(document)` auto-initialization and the IDs `weekNav`, `todoPanel`, and `documentsPanel` defined by Task 1.
- Produces: two `[data-feature-tab]` buttons with values `todo` and `documents`; matching `tabpanel` elements; a build artifact containing `feature-tabs.js`.
- Styling hooks: `.feature-tabs`, `.feature-tab`, `.feature-tab[aria-selected="true"]`, and `.documents-placeholder`.

- [ ] **Step 1: Write failing static integration tests**

Create `tests/feature-tabs-markup.test.js`:

```js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const buildScript = await readFile(
  new URL('../scripts/prepare-pages.mjs', import.meta.url),
  'utf8'
);

test('main header exposes two semantic first-level tabs', () => {
  assert.match(html, /role="tablist"[\s\S]*data-feature-tab="todo"/);
  assert.match(html, /data-feature-tab="todo"[\s\S]*>\s*To-do List\s*</);
  assert.match(html, /data-feature-tab="documents"[\s\S]*>\s*文档链接\s*</);
  assert.match(html, /id="todoPanel"[\s\S]*role="tabpanel"/);
  assert.match(html, /id="documentsPanel"[\s\S]*role="tabpanel"/);
});

test('document panel is an initially hidden placeholder and login copy is unchanged', () => {
  assert.match(
    html,
    /id="documentsPanel"[^>]*hidden[\s\S]*功能占位[\s\S]*<\/main>/
  );
  assert.match(html, /class="login-title">小胡同学To-do List<\/div>/);
});

test('tab styling retains the 22px title size and selected accent hook', () => {
  assert.match(html, /\.feature-tab\s*\{[\s\S]*font-size:\s*22px/);
  assert.match(html, /\.feature-tab\[aria-selected="true"\]/);
});

test('page loads and build copies the feature tab module', () => {
  assert.match(html, /<script type="module" src="feature-tabs\.js"><\/script>/);
  assert.match(buildScript, /'feature-tabs\.js'/);
});
```

- [ ] **Step 2: Run the static tests and verify RED**

Run:

```powershell
node --test tests/feature-tabs-markup.test.js
```

Expected: FAIL because `index.html` has no `role="tablist"` and the build script does not reference `feature-tabs.js`.

- [ ] **Step 3: Add the tab visual system**

In `index.html`, replace the unused `.title-block`, `.app-title`, `.app-title-badge`, and `.app-subtitle` header styles with:

```css
    .feature-tabs {
      display: flex;
      align-items: stretch;
      gap: 20px;
      min-width: 0;
    }

    .feature-tab {
      position: relative;
      min-height: 44px;
      padding: 0 0 8px;
      border: 0;
      background: transparent;
      color: var(--text-soft);
      font: inherit;
      font-size: 22px;
      font-weight: 600;
      letter-spacing: 0.02em;
      cursor: pointer;
      white-space: nowrap;
      transition: color var(--transition-fast);
    }

    .feature-tab::after {
      content: "";
      position: absolute;
      right: 0;
      bottom: -9px;
      left: 0;
      height: 2px;
      border-radius: 999px;
      background: transparent;
      transition: background var(--transition-fast), box-shadow var(--transition-fast);
    }

    .feature-tab:hover {
      color: var(--text-main);
    }

    .feature-tab:focus-visible {
      outline: 2px solid rgba(96, 165, 250, 0.95);
      outline-offset: 4px;
      border-radius: 4px;
    }

    .feature-tab[aria-selected="true"] {
      color: #93c5fd;
    }

    .feature-tab[aria-selected="true"]::after {
      background: var(--accent);
      box-shadow: 0 0 12px rgba(37, 99, 235, 0.75);
    }

    .documents-placeholder {
      min-height: 180px;
      display: grid;
      place-items: center;
      color: var(--text-muted);
      font-size: 16px;
    }
```

Add a narrow-screen rule inside the existing mobile media query so the header can wrap without overlap:

```css
      .app-header {
        align-items: flex-start;
        flex-wrap: wrap;
      }
```

- [ ] **Step 4: Replace the main title with semantic tabs and identify week navigation**

Replace the current `.title-block` markup in the main app header with:

```html
      <div class="feature-tabs" role="tablist" aria-label="一级功能">
        <button
          class="feature-tab"
          id="todoTab"
          type="button"
          role="tab"
          aria-controls="todoPanel"
          aria-selected="true"
          data-feature-tab="todo"
        >To-do List</button>
        <button
          class="feature-tab"
          id="documentsTab"
          type="button"
          role="tab"
          aria-controls="documentsPanel"
          aria-selected="false"
          tabindex="-1"
          data-feature-tab="documents"
        >文档链接</button>
      </div>
```

Add `id="weekNav"` to the existing week navigation container:

```html
      <div class="week-nav" id="weekNav">
```

- [ ] **Step 5: Define the two tab panels without changing todo internals**

Change the opening existing main element to:

```html
    <main
      class="sections"
      id="todoPanel"
      role="tabpanel"
      aria-labelledby="todoTab"
    >
```

Leave all three existing todo sections byte-for-byte unchanged inside it. Immediately after its closing `</main>` and before the existing footer, add:

```html
    <main
      class="sections"
      id="documentsPanel"
      role="tabpanel"
      aria-labelledby="documentsTab"
      hidden
    >
      <section class="panel documents-placeholder">功能占位</section>
    </main>
```

Immediately before the existing classic todo inline script, load the new module:

```html
  <script type="module" src="feature-tabs.js"></script>
```

- [ ] **Step 6: Include the module in Pages builds**

In `scripts/prepare-pages.mjs`, change the static file declaration to:

```js
const staticFiles = [
  'auth-ui.js',
  'd1-storage.js',
  'feature-tabs.js',
  'icon.ico',
];
```

- [ ] **Step 7: Run the focused tests and verify GREEN**

Run:

```powershell
node --test tests/feature-tabs.test.js tests/feature-tabs-markup.test.js
```

Expected: 7 tests pass, 0 fail.

- [ ] **Step 8: Build and inspect the output contract**

Run:

```powershell
npm.cmd run build
Test-Path .pages-dist\feature-tabs.js
Select-String -LiteralPath .pages-dist\index.html -Pattern 'data-feature-tab="documents"','功能占位','feature-tabs.js'
```

Expected: build exits 0, `Test-Path` prints `True`, and all three patterns are found in the generated HTML.

- [ ] **Step 9: Commit the integrated interface**

```powershell
git add -- index.html scripts/prepare-pages.mjs tests/feature-tabs-markup.test.js
git commit -m "feat: add document links primary tab"
```

Expected: the commit includes exactly the three listed files; generated `.pages-dist` output is not staged.

---

### Task 3: Regression and visual verification

**Files:**
- Verify only; no planned source changes.

**Interfaces:**
- Consumes: completed controller, markup, styling, and build integration from Tasks 1 and 2.
- Produces: evidence that all automated checks pass and the two views render correctly at desktop and narrow widths.

- [ ] **Step 1: Run the complete automated test suite**

Run:

```powershell
npm.cmd test
```

Expected: every test passes, including security, reminders, Feishu callback, feature-tab controller, and feature-tab markup tests; 0 failures.

- [ ] **Step 2: Run all syntax checks**

Run:

```powershell
npm.cmd run check
node --check feature-tabs.js
node --check scripts/prepare-pages.mjs
```

Expected: all commands exit 0 with no syntax errors.

- [ ] **Step 3: Serve the built site locally for visual verification**

Run a local static server from `.pages-dist` using an available workspace runtime, then inspect the page in the in-app browser. Verify at a normal desktop width and at 375px width:

1. After login, the main header contains only the 22px “To-do List” and “文档链接” labels on the left.
2. To-do List is initially selected with the blue indicator; todo sections and week navigation are visible.
3. Clicking “文档链接” moves the selected indicator, hides the week navigation and all todo sections, and shows only the `功能占位` panel.
4. Clicking “To-do List” restores the unchanged todo interface and the same viewed week.
5. Left/Right arrow keys move focus and selection between tabs; focus indication is visible.
6. The footer remains visible and usable in both views.
7. At 375px, the header wraps without overlapping the week controls and neither tab label is clipped.

Expected: all seven checks pass with no console errors or layout overlap.

- [ ] **Step 4: Confirm the final diff is scoped**

Run:

```powershell
git status --short
git diff HEAD~2 -- feature-tabs.js tests/feature-tabs.test.js tests/feature-tabs-markup.test.js index.html scripts/prepare-pages.mjs
```

Expected: feature changes are limited to the five planned files. Pre-existing unrelated working-tree changes remain present and untouched.

- [ ] **Step 5: Apply the verification-before-completion checklist**

Confirm fresh command output exists for the full suite, syntax checks, Pages build, and visual checks before reporting completion. If any check fails, report the exact failure and continue debugging instead of claiming success.
