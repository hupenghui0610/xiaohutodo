import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const auth = await readFile(new URL('../auth-ui.js', import.meta.url), 'utf8');
const documents = await readFile(new URL('../document-links-ui.js', import.meta.url), 'utf8');
const tabs = await readFile(new URL('../feature-tabs.js', import.meta.url), 'utf8');
const build = await readFile(new URL('../scripts/prepare-pages.mjs', import.meta.url), 'utf8');

test('auth lifecycle starts one coordinator after both prefetches', () => {
  assert.match(html, /<script type="module" src="auth-ui\.js"><\/script>/);
  assert.match(auth, /createSyncCoordinator/);
  assert.match(auth, /__todoAppInit/);
  assert.match(auth, /__documentLinksPrefetch/);
  assert.match(auth, /Promise\.allSettled/);
  assert.match(auth, /syncCoordinator\.start\(\)/);
  assert.match(auth, /syncCoordinator\.stop\(\)/);
});

test('document lifecycle exposes prefetch and silent sync hooks', () => {
  assert.match(documents, /__documentLinksPrefetch/);
  assert.match(documents, /__documentLinksSync/);
  assert.match(documents, /__documentLinksRevisions/);
});

test('tab activation no longer triggers document loading', () => {
  assert.doesNotMatch(tabs, /onDocumentsActivated|__documentLinksInit/);
});

test('Pages build copies every silent sync browser module', () => {
  assert.match(build, /'sync-coordinator\.js'/);
  assert.match(build, /'todo-sync\.js'/);
});
