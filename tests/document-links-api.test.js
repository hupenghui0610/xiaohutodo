import assert from 'node:assert/strict';
import test from 'node:test';

import { onRequest } from '../functions/api/document-links.js';
import { createDocumentDb } from './helpers/fake-document-db.js';

function request(method = 'GET', body, query = '') {
  return new Request(`https://todo.test/api/document-links${query}`, {
    method,
    headers: {
      Cookie: 'xiaohu_session=test-session',
      ...(method === 'GET' ? {} : { Origin: 'https://todo.test', 'Content-Type': 'application/json' }),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function call(db, method, body, query) {
  return onRequest({ request: request(method, body, query), env: { DB: db } });
}

const directories = [
  { id: 'dir-1', user_id: 'user-1', name: '产品', name_key: '产品', created_at: '2026-01-01', updated_at: '2026-01-01' },
  { id: 'dir-2', user_id: 'user-1', name: '销售', name_key: '销售', created_at: '2026-01-02', updated_at: '2026-01-02' },
  { id: 'foreign-dir', user_id: 'user-2', name: '私有', name_key: '私有', created_at: '2026-01-01', updated_at: '2026-01-01' },
];

test('create trims fields and uses server-owned identity and time', async () => {
  const { db, state } = createDocumentDb({ directories });
  const response = await call(db, 'POST', { directoryId: 'dir-1', title: '  标题  ', description: '  https://a.test  ', id: 'client-id' });
  assert.equal(response.status, 201);
  const item = (await response.json()).document;
  assert.equal(item.title, '标题');
  assert.equal(item.description, 'https://a.test');
  assert.notEqual(item.id, 'client-id');
  assert.match(item.createdAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(state.documents.length, 1);
});

test('invalid document fields return field errors', async () => {
  const { db } = createDocumentDb({ directories });
  const response = await call(db, 'POST', { directoryId: '', title: '题'.repeat(21), description: '' });
  assert.equal(response.status, 400);
  const data = await response.json();
  assert.equal(data.code, 'INVALID_DOCUMENT');
  assert.ok(data.fields.directoryId);
  assert.ok(data.fields.title);
  assert.ok(data.fields.description);
});

test('create cannot target another account directory', async () => {
  const { db } = createDocumentDb({ directories });
  const response = await call(db, 'POST', { directoryId: 'foreign-dir', title: '标题', description: '描述' });
  assert.equal(response.status, 404);
  assert.equal((await response.json()).code, 'DIRECTORY_NOT_FOUND');
});

test('list is account scoped and stably ordered newest first', async () => {
  const documents = [
    { id: 'b', user_id: 'user-1', directory_id: 'dir-1', title: 'B', description: 'B', created_at: '2026-01-01', updated_at: '2026-01-01' },
    { id: 'a', user_id: 'user-1', directory_id: 'dir-1', title: 'A', description: 'A', created_at: '2026-01-02', updated_at: '2026-01-02' },
    { id: 'foreign', user_id: 'user-2', directory_id: 'foreign-dir', title: 'F', description: 'F', created_at: '2026-02-01', updated_at: '2026-02-01' },
  ];
  const { db } = createDocumentDb({ directories, documents });
  const data = await (await call(db, 'GET')).json();
  assert.deepEqual(data.data.documents.map((item) => item.id), ['a', 'b']);
});

test('list returns the document revision from the same snapshot', async () => {
  const { db } = createDocumentDb({ directories, revisions: {
    'user-1': { documents_revision: 7 },
  } });
  const data = await (await call(db, 'GET')).json();
  assert.equal(data.data.revision, 7);
});

test('edit moves an owned document and preserves creation time', async () => {
  const documents = [{ id: 'doc-1', user_id: 'user-1', directory_id: 'dir-1', title: '旧', description: '旧描述', created_at: '2026-01-01', updated_at: '2026-01-01' }];
  const { db } = createDocumentDb({ directories, documents });
  const response = await call(db, 'PUT', { id: 'doc-1', directoryId: 'dir-2', title: '新', description: '新描述' });
  assert.equal(response.status, 200);
  const item = (await response.json()).document;
  assert.equal(item.directoryId, 'dir-2');
  assert.equal(item.createdAt, '2026-01-01');
  assert.equal(item.title, '新');
});

test('stale document edits return the current remote record and force can overwrite', async () => {
  const documents = [{
    id: 'doc-1', user_id: 'user-1', directory_id: 'dir-1', title: '远端', description: '远端描述',
    created_at: '2026-01-01', updated_at: '2026-02-01',
  }];
  const { db } = createDocumentDb({ directories, documents });
  const fields = {
    id: 'doc-1', directoryId: 'dir-1', title: '本地', description: '本地描述', baseUpdatedAt: '2026-01-01',
  };
  const conflict = await call(db, 'PUT', fields);
  assert.equal(conflict.status, 409);
  const conflictData = await conflict.json();
  assert.equal(conflictData.code, 'EDIT_CONFLICT');
  assert.equal(conflictData.current.title, '远端');

  const forced = await call(db, 'PUT', { ...fields, force: true });
  assert.equal(forced.status, 200);
  assert.equal((await forced.json()).document.title, '本地');
});

test('edit cannot target a foreign directory or foreign document', async () => {
  const documents = [
    { id: 'own', user_id: 'user-1', directory_id: 'dir-1', title: '旧', description: '旧', created_at: '2026-01-01', updated_at: '2026-01-01' },
    { id: 'foreign', user_id: 'user-2', directory_id: 'foreign-dir', title: '旧', description: '旧', created_at: '2026-01-01', updated_at: '2026-01-01' },
  ];
  const { db } = createDocumentDb({ directories, documents });
  assert.equal((await call(db, 'PUT', { id: 'own', directoryId: 'foreign-dir', title: '新', description: '新' })).status, 404);
  assert.equal((await call(db, 'PUT', { id: 'foreign', directoryId: 'dir-1', title: '新', description: '新' })).status, 404);
});

test('delete removes only the current account document', async () => {
  const documents = [{ id: 'foreign', user_id: 'user-2', directory_id: 'foreign-dir', title: '旧', description: '旧', created_at: '2026-01-01', updated_at: '2026-01-01' }];
  const { db } = createDocumentDb({ directories, documents });
  assert.equal((await call(db, 'DELETE', undefined, '?id=foreign')).status, 404);
});

test('HTML-like descriptions remain literal text', async () => {
  const { db } = createDocumentDb({ directories });
  const literal = '<script>alert(1)</script>';
  const response = await call(db, 'POST', { directoryId: 'dir-1', title: '安全', description: literal });
  assert.equal((await response.json()).document.description, literal);
});
