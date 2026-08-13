import assert from 'node:assert/strict';
import test from 'node:test';

import { onRequest } from '../functions/api/document-directories.js';
import { createDocumentDb } from './helpers/fake-document-db.js';

function request(method = 'GET', body, query = '') {
  return new Request(`https://todo.test/api/document-directories${query}`, {
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

test('first load creates the three initial directories once', async () => {
  const { db, state } = createDocumentDb();
  const response = await call(db, 'GET');
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.deepEqual(data.data.directories.map((item) => item.name), ['赠品管理', '产品文档', '销售政策']);
  assert.equal(state.initializedUsers.has('user-1'), true);

  state.directories.length = 0;
  const second = await call(db, 'GET');
  assert.deepEqual((await second.json()).data.directories, []);
});

test('create trims names and rejects case-insensitive duplicates', async () => {
  const { db } = createDocumentDb({ initializedUsers: ['user-1'] });
  const created = await call(db, 'POST', { name: '  Product  ' });
  assert.equal(created.status, 201);
  assert.equal((await created.json()).directory.name, 'Product');
  const duplicate = await call(db, 'POST', { name: 'product' });
  assert.equal(duplicate.status, 409);
  assert.equal((await duplicate.json()).code, 'DIRECTORY_NAME_CONFLICT');
});

test('direct create initializes defaults first and appends after them', async () => {
  const { db } = createDocumentDb();
  const created = await (await call(db, 'POST', { name: 'Custom' })).json();
  assert.equal(created.directory.sortOrder, 3);
  const listed = await (await call(db, 'GET')).json();
  assert.deepEqual(listed.data.directories.map((item) => item.sortOrder), [0, 1, 2, 3]);
});

test('rename is account scoped', async () => {
  const { db } = createDocumentDb({ initializedUsers: ['user-1'], directories: [
    { id: 'foreign', user_id: 'user-2', name: '销售', name_key: '销售', created_at: '2026-01-01', updated_at: '2026-01-01' },
  ] });
  const response = await call(db, 'PUT', { id: 'foreign', name: '新名称' });
  assert.equal(response.status, 404);
});

test('rename response preserves the saved sort order', async () => {
  const { db } = createDocumentDb({ initializedUsers: ['user-1'], directories: [
    { id: 'third', user_id: 'user-1', name: 'Old', name_key: 'old', sort_order: 2, created_at: '2026-01-03', updated_at: '2026-01-03' },
  ] });
  const response = await call(db, 'PUT', { id: 'third', name: 'New' });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).directory.sortOrder, 2);
});

test('list returns stable order and account-scoped document counts', async () => {
  const { db } = createDocumentDb({ initializedUsers: ['user-1'], directories: [
    { id: 'b', user_id: 'user-1', name: 'B', name_key: 'b', created_at: '2026-01-02', updated_at: '2026-01-02' },
    { id: 'a', user_id: 'user-1', name: 'A', name_key: 'a', created_at: '2026-01-01', updated_at: '2026-01-01' },
  ], documents: [
    { id: 'd1', user_id: 'user-1', directory_id: 'a', title: 'x', description: 'y', created_at: '2026-01-01', updated_at: '2026-01-01' },
    { id: 'd2', user_id: 'user-2', directory_id: 'a', title: 'x', description: 'y', created_at: '2026-01-01', updated_at: '2026-01-01' },
  ] });
  const data = await (await call(db, 'GET')).json();
  assert.deepEqual(data.data.directories.map((item) => [item.id, item.documentCount]), [['a', 1], ['b', 0]]);
});

test('list uses saved sort order and create appends to the end', async () => {
  const { db } = createDocumentDb({ initializedUsers: ['user-1'], directories: [
    { id: 'later-created', user_id: 'user-1', name: 'A', name_key: 'a', sort_order: 0, created_at: '2026-01-02', updated_at: '2026-01-02' },
    { id: 'earlier-created', user_id: 'user-1', name: 'B', name_key: 'b', sort_order: 1, created_at: '2026-01-01', updated_at: '2026-01-01' },
  ] });
  const listed = await (await call(db, 'GET')).json();
  assert.deepEqual(listed.data.directories.map((item) => [item.id, item.sortOrder]), [
    ['later-created', 0], ['earlier-created', 1],
  ]);
  const created = await (await call(db, 'POST', { name: 'C' })).json();
  assert.equal(created.directory.sortOrder, 2);
});

test('move swaps only adjacent owned directories', async () => {
  const { db } = createDocumentDb({ initializedUsers: ['user-1'], directories: [
    { id: 'a', user_id: 'user-1', name: 'A', name_key: 'a', sort_order: 0, created_at: '2026-01-01', updated_at: '2026-01-01' },
    { id: 'b', user_id: 'user-1', name: 'B', name_key: 'b', sort_order: 1, created_at: '2026-01-02', updated_at: '2026-01-02' },
    { id: 'c', user_id: 'user-1', name: 'C', name_key: 'c', sort_order: 2, created_at: '2026-01-03', updated_at: '2026-01-03' },
  ] });
  const response = await call(db, 'PUT', { id: 'b', direction: 'up' });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.deepEqual(data.data.directories.map((item) => item.id), ['b', 'a', 'c']);
});

test('move rejects boundaries invalid directions and foreign directories', async () => {
  const { db } = createDocumentDb({ initializedUsers: ['user-1'], directories: [
    { id: 'a', user_id: 'user-1', name: 'A', name_key: 'a', sort_order: 0, created_at: '2026-01-01', updated_at: '2026-01-01' },
    { id: 'foreign', user_id: 'user-2', name: 'F', name_key: 'f', sort_order: 0, created_at: '2026-01-01', updated_at: '2026-01-01' },
  ] });
  assert.equal((await call(db, 'PUT', { id: 'a', direction: 'up' })).status, 400);
  assert.equal((await call(db, 'PUT', { id: 'a', direction: 'sideways' })).status, 400);
  assert.equal((await call(db, 'PUT', { id: 'foreign', direction: 'down' })).status, 404);
});

test('delete refuses non-empty directories and removes empty ones', async () => {
  const directories = [
    { id: 'full', user_id: 'user-1', name: 'Full', name_key: 'full', created_at: '2026-01-01', updated_at: '2026-01-01' },
    { id: 'empty', user_id: 'user-1', name: 'Empty', name_key: 'empty', created_at: '2026-01-02', updated_at: '2026-01-02' },
  ];
  const documents = [{ id: 'd1', user_id: 'user-1', directory_id: 'full', title: 'x', description: 'y', created_at: '2026-01-01', updated_at: '2026-01-01' }];
  const { db } = createDocumentDb({ initializedUsers: ['user-1'], directories, documents });
  const conflict = await call(db, 'DELETE', undefined, '?id=full');
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).code, 'DIRECTORY_NOT_EMPTY');
  assert.equal((await call(db, 'DELETE', undefined, '?id=empty')).status, 200);
});

test('writes require exact same origin', async () => {
  const { db } = createDocumentDb();
  const invalid = new Request('https://todo.test/api/document-directories', {
    method: 'POST', headers: { Cookie: 'xiaohu_session=test-session', Origin: 'https://evil.test' }, body: '{}',
  });
  const response = await onRequest({ request: invalid, env: { DB: db } });
  assert.equal(response.status, 403);
});
