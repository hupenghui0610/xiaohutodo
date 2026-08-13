import assert from 'node:assert/strict';
import test from 'node:test';

import { createDocumentLinksStore } from '../document-links-state.js';

const directories = [
  { id: 'dir-new', name: '新目录', documentCount: 0, createdAt: '2026-01-02', updatedAt: '2026-01-02' },
  { id: 'dir-old', name: '旧目录', documentCount: 2, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
];
const documents = [
  { id: 'doc-old', directoryId: 'dir-old', title: '旧标题', description: '旧描述', createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  { id: 'doc-new', directoryId: 'dir-old', title: '新标题', description: '新描述', createdAt: '2026-01-02', updatedAt: '2026-01-02' },
];

function setup(options = {}) {
  const calls = [];
  const request = async (url, requestOptions = {}) => {
    calls.push({ url, method: requestOptions.method || 'GET', body: requestOptions.body });
    if (url === '/api/document-directories' && !requestOptions.method) {
      return { data: { directories: structuredClone(directories) } };
    }
    if (url === '/api/document-links' && !requestOptions.method) {
      return { data: { documents: structuredClone(documents) } };
    }
    if (options.saveError && requestOptions.method === 'POST') throw options.saveError;
    if (requestOptions.method === 'POST' && url === '/api/document-links') {
      const fields = JSON.parse(requestOptions.body);
      return { document: { id: 'doc-created', ...fields, createdAt: '2026-02-01', updatedAt: '2026-02-01' } };
    }
    if (requestOptions.method === 'PUT' && url === '/api/document-links') {
      const fields = JSON.parse(requestOptions.body);
      const original = documents.find((item) => item.id === fields.id);
      return { document: { ...original, ...fields, updatedAt: '2026-02-01' } };
    }
    return { code: 'OK' };
  };
  return { store: createDocumentLinksStore({ request }), calls };
}

function setupReady(options = {}) {
  const result = setup(options);
  result.store.hydrateForTest({ directories, documents });
  result.calls.length = 0;
  return result;
}

test('load fetches directories and documents once and sorts them', async () => {
  const { store, calls } = setup();
  await store.load();
  await store.load();
  assert.deepEqual(calls.map((call) => call.url), ['/api/document-directories', '/api/document-links']);
  assert.deepEqual(store.getState().directories.map((item) => item.id), ['dir-old', 'dir-new']);
  assert.deepEqual(store.getState().documents.map((item) => item.id), ['doc-new', 'doc-old']);
});

test('beginAdd permits only one active editor', () => {
  const { store } = setupReady();
  assert.equal(store.beginAdd('dir-old'), true);
  assert.equal(store.beginAdd('dir-new'), false);
  assert.equal(store.getState().editor.draft.directoryId, 'dir-old');
});

test('beginEdit copies all editable fields and cancel makes no request', () => {
  const { store, calls } = setupReady();
  store.beginEdit('doc-old');
  assert.deepEqual(store.getState().editor.draft, {
    directoryId: 'dir-old', title: '旧标题', description: '旧描述',
  });
  store.cancelEdit();
  assert.equal(store.getState().editor, null);
  assert.equal(calls.length, 0);
});

test('saveDraft validates Unicode limits before requesting', async () => {
  const { store, calls } = setupReady();
  store.beginAdd('dir-old');
  store.updateDraft({ title: '题'.repeat(21), description: '说明' });
  assert.equal(await store.saveDraft(), false);
  assert.match(store.getState().editor.errors.title, /20/);
  assert.equal(calls.length, 0);
});

test('failed save retains the draft and exposes its error', async () => {
  const { store } = setupReady({ saveError: new Error('网络错误') });
  store.beginAdd('dir-old');
  store.updateDraft({ title: '标题', description: '描述' });
  await store.saveDraft();
  assert.equal(store.getState().editor.draft.title, '标题');
  assert.equal(store.getState().editor.error, '网络错误');
});

test('successful move preserves createdAt and changes directory', async () => {
  const { store } = setupReady();
  const createdAt = store.getState().documents.find((item) => item.id === 'doc-old').createdAt;
  store.beginEdit('doc-old');
  store.updateDraft({ directoryId: 'dir-new' });
  assert.equal(await store.saveDraft(), true);
  const moved = store.getState().documents.find((item) => item.id === 'doc-old');
  assert.equal(moved.directoryId, 'dir-new');
  assert.equal(moved.createdAt, createdAt);
});

test('reset clears scoped state and permits a fresh load', async () => {
  const { store, calls } = setup();
  await store.load();
  store.reset();
  assert.deepEqual(store.getState().directories, []);
  await store.load();
  assert.equal(calls.filter((call) => call.url === '/api/document-directories').length, 2);
});
