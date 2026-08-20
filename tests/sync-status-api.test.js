import assert from 'node:assert/strict';
import test from 'node:test';

import { createDocumentDb } from './helpers/fake-document-db.js';

const syncModule = await import('../functions/api/sync-status.js').catch(() => ({}));

function request(cookie = 'xiaohu_session=test-session') {
  return new Request('https://todo.test/api/sync-status', {
    headers: cookie ? { Cookie: cookie } : {},
  });
}

test('sync status endpoint exists', () => {
  assert.equal(typeof syncModule.onRequest, 'function');
});

test('returns zero revisions for a user without revision state', async () => {
  const { db } = createDocumentDb();
  const response = await syncModule.onRequest({ request: request(), env: { DB: db } });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data, {
    todosRevision: 0,
    directoriesRevision: 0,
    documentsRevision: 0,
  });
});

test('returns account-scoped revisions without caching', async () => {
  const { db } = createDocumentDb({ revisions: {
    'user-1': { todos_revision: 3, directories_revision: 4, documents_revision: 5 },
    'user-2': { todos_revision: 90, directories_revision: 90, documents_revision: 90 },
  } });
  const response = await syncModule.onRequest({ request: request(), env: { DB: db } });
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual((await response.json()).data, {
    todosRevision: 3,
    directoriesRevision: 4,
    documentsRevision: 5,
  });
});
