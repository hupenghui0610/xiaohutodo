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
  assert.match(html, /class="feature-tab-divider" aria-hidden="true">\|<\/span>/);
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

test('tab styling uses the compact 18px title size and selected accent hook', () => {
  assert.match(html, /\.feature-tab\s*\{[\s\S]*font-size:\s*18px/);
  assert.match(html, /\.feature-tab-divider\s*\{/);
  assert.match(html, /\.feature-tab\[aria-selected="true"\]/);
});

test('page loads and build copies the feature tab module', () => {
  assert.match(html, /<script type="module" src="feature-tabs\.js"><\/script>/);
  assert.match(buildScript, /'feature-tabs\.js'/);
});

test('hidden tab panels cannot be displayed by the sections layout rule', () => {
  assert.match(html, /\.sections\[hidden\]\s*\{\s*display:\s*none;/);
});

test('footer legend is todo-specific while account controls remain common', () => {
  assert.match(html, /<div class="legend" id="todoLegend">/);
  assert.match(html, /<\/div>\s*<div class="footer-right">[\s\S]*id="currentAccount"/);
});
