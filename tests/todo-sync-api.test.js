import assert from 'node:assert/strict';
import test from 'node:test';

import { onRequest } from '../functions/api/d1.js';
import { createDocumentDb } from './helpers/fake-document-db.js';

function request(method = 'GET', body, query = '') {
  return new Request(`https://todo.test/api/d1${query}`, {
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

const todo = {
  id: 'todo-1', user_id: 'user-1', type: 'A', title: '远端', done: 0,
  date: null, weekStart: null, delayed: 0,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-02-01T00:00:00.000Z',
};

test('todo list returns update tokens and revision', async () => {
  const { db } = createDocumentDb({ todos: [todo], revisions: {
    'user-1': { todos_revision: 8 },
  } });
  const response = await call(db, 'GET');
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.data.revision, 8);
  assert.equal(data.data.items[0].updatedAt, todo.updatedAt);
});

test('stale todo edit conflicts and force overwrites', async () => {
  const { db } = createDocumentDb({ todos: [todo] });
  const fields = {
    type: 'A', title: '本地', done: false, date: null, weekStart: null, delayed: false,
    createdAt: todo.createdAt, baseUpdatedAt: '2026-01-01T00:00:00.000Z',
  };
  const conflict = await call(db, 'PUT', { id: todo.id, fields });
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).current.title, '远端');

  const forced = await call(db, 'PUT', { id: todo.id, fields: { ...fields, force: true } });
  assert.equal(forced.status, 200);
  const forcedData = await forced.json();
  assert.equal(forcedData.todo.title, '本地');
  assert.equal(forcedData.revision, 1);
});
