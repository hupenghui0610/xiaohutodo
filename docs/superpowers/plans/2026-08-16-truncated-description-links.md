# Truncated Description Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Visually truncate only long links in document-list descriptions while retaining full URLs, complete following text, and unchanged editor content.

**Architecture:** Keep the full URL as anchor text and `href`; CSS applies a per-anchor responsive ellipsis. Add the full URL as the native hover title. No state, API, database, or editor changes.

**Tech Stack:** Browser DOM APIs, CSS, Node.js built-in test runner.

## Global Constraints

- Only list-view anchors are truncated; editor textarea content stays complete.
- Each link has a maximum visual width of `42ch` and never exceeds its description column.
- Following punctuation, descriptive text, and other links remain complete and wrap normally.
- Full URL remains in DOM text, `href`, and `title`; existing safe new-tab behavior remains.

---

### Task 1: Add per-link visual truncation

**Files:**
- Modify: `tests/document-links-ui.test.js`
- Modify: `tests/feature-tabs-markup.test.js`
- Modify: `document-links-ui.js`
- Modify: `index.html`

**Interfaces:**
- Consumes: existing `.document-row__description-link` anchors containing full URLs.
- Produces: the same anchors with full `title` values and CSS-only end ellipsis.

- [ ] **Step 1: Write failing behavior and markup tests**

In the existing safe-link UI test, add:

```js
links.forEach((link) => {
  assert.equal(link.getAttribute('title'), link.getAttribute('href'));
});
```

In `tests/feature-tabs-markup.test.js`, add:

```js
test('document links truncate individually without clipping following description text', () => {
  assert.match(html, /\.document-row__description-link\s*\{[^}]*display:\s*inline-block/);
  assert.match(html, /\.document-row__description-link\s*\{[^}]*max-width:\s*min\(42ch,\s*100%\)/);
  assert.match(html, /\.document-row__description-link\s*\{[^}]*overflow:\s*hidden/);
  assert.match(html, /\.document-row__description-link\s*\{[^}]*text-overflow:\s*ellipsis/);
  assert.match(html, /\.document-row__description-link\s*\{[^}]*white-space:\s*nowrap/);
  assert.doesNotMatch(html, /\.document-row__description\s*\{[^}]*text-overflow:\s*ellipsis/);
});
```

- [ ] **Step 2: Verify the new tests fail for the missing behavior**

Run:

```powershell
node --test tests/document-links-ui.test.js tests/feature-tabs-markup.test.js
```

Expected: FAIL because link `title` and truncation declarations are absent.

- [ ] **Step 3: Implement the minimal DOM and CSS changes**

In `renderDescription`, retain all existing attributes and add:

```js
link.setAttribute('title', segment.value);
```

Extend `.document-row__description-link` without changing its existing colors or focus rules:

```css
display: inline-block;
max-width: min(42ch, 100%);
overflow: hidden;
text-overflow: ellipsis;
white-space: nowrap;
vertical-align: bottom;
```

- [ ] **Step 4: Run focused and full verification**

Run:

```powershell
node --test tests/document-links-ui.test.js tests/feature-tabs-markup.test.js
npm.cmd test
npm.cmd run check
```

Expected: all commands exit `0`; links retain full URLs and no description-container truncation rule exists.

- [ ] **Step 5: Commit only the four implementation files**

```powershell
git add -- document-links-ui.js index.html tests/document-links-ui.test.js tests/feature-tabs-markup.test.js
git diff --cached --check
git commit -m "style: truncate long document links"
```
