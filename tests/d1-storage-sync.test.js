import assert from 'node:assert/strict';
import test from 'node:test';

const storageModule = await import('../d1-storage.js').catch(() => ({}));

test('D1 storage exports revision-aware refresh helpers', () => {
  assert.equal(typeof storageModule.D1Storage?.refreshTodos, 'function');
  assert.equal(typeof storageModule.D1Storage?.getRevision, 'function');
  assert.equal(typeof storageModule.D1Storage?.replaceSnapshot, 'function');
});

test('remote refresh replaces todo snapshot and revision', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ data: {
    items: [{
      id: 'remote-id', type: 'A', title: '远端', done: false, date: null,
      weekStart: null, delayed: false, createdAt: '2026-01-01', updatedAt: '2026-02-01',
    }],
    revision: 7,
  } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  try {
    const result = await storageModule.D1Storage.refreshTodos();
    assert.equal(result.revision, 7);
    assert.deepEqual([...storageModule.D1Storage.snapshot.keys()], ['remote-id']);
    assert.equal(storageModule.D1Storage.getRevision(), 7);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
