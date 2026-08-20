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

test('todo updates submit the snapshot token and apply the server update token', async () => {
  const originalFetch = globalThis.fetch;
  const previous = {
    id: 'todo-1', type: 'A', title: '旧', done: false, date: null, weekStart: null,
    delayed: false, createdAt: '2026-01-01', updatedAt: '2026-01-01',
  };
  const local = { ...previous, title: '新' };
  let submitted;
  globalThis.fetch = async (_url, options) => {
    submitted = JSON.parse(options.body);
    return new Response(JSON.stringify({
      code: 'OK', todo: { ...local, updatedAt: '2026-02-01' }, revision: 2,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    storageModule.D1Storage.replaceSnapshot([previous], 1);
    assert.equal(await storageModule.D1Storage.saveTodos([local]), true);
    assert.equal(submitted.fields.baseUpdatedAt, '2026-01-01');
    assert.equal(local.updatedAt, '2026-02-01');
    assert.equal(storageModule.D1Storage.snapshot.get('todo-1').updatedAt, '2026-02-01');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('todo edit conflicts are surfaced without replacing the snapshot', async () => {
  const originalFetch = globalThis.fetch;
  const previous = {
    id: 'todo-1', type: 'A', title: '旧', done: false, date: null, weekStart: null,
    delayed: false, createdAt: '2026-01-01', updatedAt: '2026-01-01',
  };
  globalThis.fetch = async () => new Response(JSON.stringify({
    code: 'EDIT_CONFLICT', message: '冲突', current: { ...previous, title: '远端', updatedAt: '2026-02-01' },
  }), { status: 409, headers: { 'Content-Type': 'application/json' } });
  try {
    storageModule.D1Storage.replaceSnapshot([previous], 1);
    assert.equal(await storageModule.D1Storage.saveTodos([{ ...previous, title: '本地' }]), false);
    assert.equal(storageModule.D1Storage.lastConflict.id, 'todo-1');
    assert.equal(storageModule.D1Storage.lastConflict.current.title, '远端');
    assert.equal(storageModule.D1Storage.snapshot.get('todo-1').title, '旧');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
