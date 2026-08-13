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

test('document panel exposes final content and login copy is unchanged', () => {
  assert.match(html, /id="documentsPanel"[^>]*hidden[\s\S]*id="documentsContent"[\s\S]*<\/main>/);
  assert.doesNotMatch(html, /功能占位/);
  assert.match(html, /class="login-title">小胡同学To-do List<\/div>/);
});

test('document management and custom confirmation dialogs are present', () => {
  assert.match(html, /id="directoryManageBtn"[^>]*hidden[^>]*>目录管理<\/button>/);
  assert.match(html, /id="directoryModal"[^>]*role="dialog"[^>]*aria-modal="true"/);
  assert.match(html, /id="confirmModal"[^>]*role="alertdialog"[^>]*aria-modal="true"/);
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
  assert.match(html, /\.week-nav\[hidden\][\s\S]*?#directoryManageBtn\[hidden\][\s\S]*?display:\s*none;/);
});

test('footer legend is removed while account controls remain common', () => {
  assert.doesNotMatch(html, /id="todoLegend"/);
  assert.match(html, /<div class="footer-right">[\s\S]*id="currentAccount"/);
  assert.match(html, /\.panel-header\s*\{[\s\S]*?justify-content:\s*space-between/);
  assert.match(html, /\.app-footer\s*\{[\s\S]*?justify-content:\s*flex-end/);
});

test('document editor uses the compact two-row responsive layout', () => {
  assert.match(html, /\.document-editor__top-fields\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*2fr\)\s+minmax\(180px,\s*1fr\)/);
  assert.match(html, /\.document-description-input\s*\{[\s\S]*?min-height:\s*64px/);
  assert.match(html, /\.document-editor__footer\s*\{[\s\S]*?justify-content:\s*space-between/);
  assert.match(html, /@media\s*\(max-width:\s*768px\)[\s\S]*?\.document-editor__top-fields[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)/);
});

test('document editor uses restrained field corners while actions stay pill shaped', () => {
  assert.match(html, /\.document-editor\s*\{[\s\S]*?border-radius:\s*var\(--radius-md\)/);
  assert.match(html, /\.document-editor \.input\s*\{[\s\S]*?border-radius:\s*6px/);
  assert.match(html, /\.btn\s*\{[\s\S]*?border-radius:\s*999px/);
});
