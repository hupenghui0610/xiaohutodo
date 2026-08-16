# Clickable Description Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically turn every boundary-delimited HTTP(S) URL in a document description into a safe, browser-opening link without changing the stored description.

**Architecture:** Add a pure `parseDescriptionSegments(text)` function to the existing document UI module, returning ordered text/link segments. The row renderer converts only validated link segments into anchors and keeps every other character in text-only DOM nodes; existing state, API, and database code remain untouched.

**Tech Stack:** Browser ES modules, DOM APIs, CSS, Node.js built-in test runner and `node:assert/strict`.

## Global Constraints

- Recognize multiple links beginning with case-insensitive `http://` or `https://`.
- End candidates at whitespace, newlines, or `，。；！？、`; keep those delimiters visible.
- Remove terminal `,.!?;:` and unmatched terminal `)`, `]`, or `}` from a candidate while preserving them as visible text.
- Keep paired closing brackets inside links and validate every candidate with `URL`.
- Do not recognize bare domains or Markdown link syntax.
- Do not use `innerHTML`, change persisted descriptions, add dependencies, or modify state/API/database behavior.
- Every generated anchor uses `target="_blank"` and `rel="noopener noreferrer"`.

---

### Task 1: Parse and safely render all description links

**Files:**
- Modify: `tests/document-links-ui.test.js`
- Modify: `document-links-ui.js:1-182`
- Modify: `index.html:208-216`

**Interfaces:**
- Consumes: `document.description` as the unchanged stored string and the existing `element(root, tagName, className, text)` DOM helper.
- Produces: `parseDescriptionSegments(text: string): Array<{ type: 'text' | 'link', value: string }>` and a description container whose validated URL segments are `<a class="document-row__description-link">` elements.

- [ ] **Step 1: Extend the fake DOM and write failing parser/rendering tests**

In `tests/document-links-ui.test.js`, import the new pure function:

```js
import { createDocumentLinksUi, parseDescriptionSegments } from '../document-links-ui.js';
```

Add this helper after `find` so mixed text and anchor content can be asserted without relying on the fake DOM to aggregate descendant text:

```js
function visibleText(node) {
  if (!node.children.length) return node.textContent;
  return node.children.map(visibleText).join('');
}
```

Allow `setup` to accept a description override and use it in the document fixture:

```js
function setup({ documentCount = 1, directories, description = '<script>alert(1)</script>' } = {}) {
  // existing setup
  // inside the document fixture:
  description,
}
```

Replace the existing `description is plain text and only title starts editing` test with these focused tests:

```js
test('parser preserves text while splitting multiple HTTP links at explicit boundaries', () => {
  const input = '主地址：https://a.example/x?id=1&tab=2，备用 https://b.example/docs#top。';
  assert.deepEqual(parseDescriptionSegments(input), [
    { type: 'text', value: '主地址：' },
    { type: 'link', value: 'https://a.example/x?id=1&tab=2' },
    { type: 'text', value: '，备用 ' },
    { type: 'link', value: 'https://b.example/docs#top' },
    { type: 'text', value: '。' },
  ]);
});

test('parser trims sentence punctuation and unmatched brackets but keeps paired brackets', () => {
  assert.deepEqual(parseDescriptionSegments('参考 https://example.com/wiki/A_(B)。另见 https://example.com/x).'), [
    { type: 'text', value: '参考 ' },
    { type: 'link', value: 'https://example.com/wiki/A_(B)' },
    { type: 'text', value: '。另见 ' },
    { type: 'link', value: 'https://example.com/x' },
    { type: 'text', value: ').' },
  ]);
});

test('parser leaves invalid and non-HTTP candidates as text', () => {
  assert.deepEqual(parseDescriptionSegments('www.example.com ftp://example.com https://'), [
    { type: 'text', value: 'www.example.com ftp://example.com https://' },
  ]);
});

test('description renders multiple safe links without interpreting HTML', async () => {
  const input = '<script>alert(1)</script> https://a.example，备用 https://b.example/docs';
  const { root, calls } = setup({ description: input });
  const content = root.getElementById('documentsContent');
  const description = find(content, (item) => item.classList.contains('document-row__description'));
  const links = [];
  const collectLinks = (node) => {
    if (node.tagName === 'A') links.push(node);
    node.children.forEach(collectLinks);
  };
  collectLinks(description);

  assert.equal(visibleText(description), input);
  assert.deepEqual(links.map((link) => link.getAttribute('href')), ['https://a.example', 'https://b.example/docs']);
  links.forEach((link) => {
    assert.equal(link.getAttribute('target'), '_blank');
    assert.equal(link.getAttribute('rel'), 'noopener noreferrer');
  });
  assert.equal(find(content, (item) => item.tagName === 'SCRIPT'), null);

  await description.dispatch('click');
  assert.deepEqual(calls, []);
  const title = find(content, (item) => item.classList.contains('document-row__title'));
  await title.dispatch('click');
  assert.deepEqual(calls, [['beginEdit', 'doc-1']]);
});
```

- [ ] **Step 2: Run the focused tests and verify the expected failure**

Run:

```powershell
node --test tests/document-links-ui.test.js
```

Expected: FAIL during module import because `document-links-ui.js` does not export `parseDescriptionSegments`.

- [ ] **Step 3: Implement the minimal pure parser and safe DOM renderer**

Add these helpers after `element` in `document-links-ui.js`:

```js
const DESCRIPTION_URL_CANDIDATE = /https?:\/\/[^\s，。；！？、]+/giu;
const TERMINAL_SENTENCE_PUNCTUATION = /[,.!?;:]+$/u;
const BRACKET_PAIRS = { ')': '(', ']': '[', '}': '{' };

function splitTerminalCharacters(candidate) {
  let value = candidate;
  let trailing = '';
  const punctuation = value.match(TERMINAL_SENTENCE_PUNCTUATION)?.[0] || '';
  if (punctuation) {
    value = value.slice(0, -punctuation.length);
    trailing = punctuation + trailing;
  }

  while (BRACKET_PAIRS[value.at(-1)]) {
    const closing = value.at(-1);
    const opening = BRACKET_PAIRS[closing];
    const openingCount = [...value].filter((character) => character === opening).length;
    const closingCount = [...value].filter((character) => character === closing).length;
    if (closingCount <= openingCount) break;
    value = value.slice(0, -1);
    trailing = closing + trailing;
  }
  return { value, trailing };
}

function isValidHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function appendSegment(segments, type, value) {
  if (!value) return;
  const previous = segments.at(-1);
  if (type === 'text' && previous?.type === 'text') {
    previous.value += value;
    return;
  }
  segments.push({ type, value });
}

export function parseDescriptionSegments(text = '') {
  const source = String(text);
  const segments = [];
  let cursor = 0;

  for (const match of source.matchAll(DESCRIPTION_URL_CANDIDATE)) {
    if (match.index > cursor) appendSegment(segments, 'text', source.slice(cursor, match.index));
    const { value, trailing } = splitTerminalCharacters(match[0]);
    if (value && isValidHttpUrl(value)) {
      appendSegment(segments, 'link', value);
      appendSegment(segments, 'text', trailing);
    } else {
      appendSegment(segments, 'text', match[0]);
    }
    cursor = match.index + match[0].length;
  }

  if (cursor < source.length) appendSegment(segments, 'text', source.slice(cursor));
  return segments.length ? segments : [{ type: 'text', value: source }];
}

function renderDescription(text) {
  const container = element(root, 'div', 'document-row__description');
  for (const segment of parseDescriptionSegments(text)) {
    if (segment.type === 'text') {
      container.append(element(root, 'span', '', segment.value));
      continue;
    }
    const link = element(root, 'a', 'document-row__description-link', segment.value);
    link.setAttribute('href', segment.value);
    link.setAttribute('target', '_blank');
    link.setAttribute('rel', 'noopener noreferrer');
    container.append(link);
  }
  return container;
}
```

`renderDescription` must be declared inside `createDocumentLinksUi`, because it uses that function's injected `root`. In `renderDocumentRow`, replace:

```js
const description = element(root, 'div', 'document-row__description', document.description);
```

with:

```js
const description = renderDescription(document.description);
```

- [ ] **Step 4: Run the focused tests and verify they pass**

Run:

```powershell
node --test tests/document-links-ui.test.js
```

Expected: all tests in `tests/document-links-ui.test.js` PASS with no uncaught errors.

- [ ] **Step 5: Add link styling using existing visual tokens**

Immediately after `.document-row__description` in `index.html`, add:

```css
.document-row__description-link {
  color: var(--accent);
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 2px;
  cursor: pointer;
}

.document-row__description-link:hover {
  color: var(--accent-strong);
}

.document-row__description-link:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: 2px;
}
```

- [ ] **Step 6: Run feature and regression verification**

Run:

```powershell
node --test tests/document-links-ui.test.js tests/document-links-state.test.js tests/feature-tabs.test.js tests/feature-tabs-markup.test.js
npm.cmd run check
```

Expected: both commands exit `0`; every selected test passes and all checked JavaScript files parse successfully.

- [ ] **Step 7: Review the exact diff and commit the implementation**

Run:

```powershell
git diff --check
git diff -- document-links-ui.js tests/document-links-ui.test.js index.html
git status --short
git add -- document-links-ui.js tests/document-links-ui.test.js index.html
git diff --cached --check
git commit -m "feat: make description links clickable"
```

Expected: the staged diff contains only the parser, safe description renderer, focused tests, and link styles; the commit succeeds without staging unrelated working-tree changes.
