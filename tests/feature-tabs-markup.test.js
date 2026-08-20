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

test('page exposes revision-aware todo synchronization without a loading view', () => {
  assert.match(html, /<script type="module" src="todo-sync\.js"><\/script>/);
  assert.match(html, /window\.__todoAppSync\s*=/);
  assert.match(html, /li\.dataset\.todoId\s*=\s*todo\.id/g);
  assert.doesNotMatch(html, /同步待办中|正在刷新待办/);
});

test('todo save conflicts ask before explicitly overwriting remote data', () => {
  assert.match(html, /D1Storage\.lastConflict/);
  assert.match(html, /forceIds/);
  assert.match(html, /其他设备.*仍然覆盖/s);
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

test('document links truncate individually without clipping following description text', () => {
  assert.match(html, /\.document-row__description-link\s*\{[^}]*display:\s*inline-block/);
  assert.match(html, /\.document-row__description-link\s*\{[^}]*max-width:\s*min\(42ch,\s*100%\)/);
  assert.match(html, /\.document-row__description-link\s*\{[^}]*overflow:\s*hidden/);
  assert.match(html, /\.document-row__description-link\s*\{[^}]*text-overflow:\s*ellipsis/);
  assert.match(html, /\.document-row__description-link\s*\{[^}]*white-space:\s*nowrap/);
  assert.doesNotMatch(html, /\.document-row__description\s*\{[^}]*text-overflow:\s*ellipsis/);
});

test('document editor uses restrained field corners while actions stay pill shaped', () => {
  assert.match(html, /\.document-editor\s*\{[\s\S]*?border-radius:\s*var\(--radius-md\)/);
  assert.match(html, /\.document-editor \.input\s*\{[\s\S]*?border-radius:\s*6px/);
  assert.match(html, /\.btn\s*\{[\s\S]*?border-radius:\s*999px/);
});

test('directory management matches the subdued week switcher style', () => {
  assert.match(html, /id="directoryManageBtn"[^>]*class="btn directory-manage-btn"/);
  assert.match(html, /\.directory-manage-btn\s*\{[\s\S]*?background:\s*rgba\(17,\s*24,\s*39,\s*0\.82\)/);
  assert.match(html, /\.directory-manage-btn\s*\{[\s\S]*?border:\s*1px solid rgba\(31,\s*41,\s*55,\s*0\.9\)/);
  assert.match(html, /\.directory-manage-btn\s*\{[\s\S]*?box-shadow:\s*var\(--shadow-subtle\)/);
  assert.match(html, /\.directory-manage-btn:hover\s*\{[\s\S]*?color:\s*#93c5fd/);
  assert.ok(
    html.indexOf('.directory-manage-btn {') > html.indexOf('.btn {'),
    'directory-specific styles must follow the generic button rule so they win the cascade'
  );
});
