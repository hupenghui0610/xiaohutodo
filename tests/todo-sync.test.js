import assert from 'node:assert/strict';
import test from 'node:test';

const todoSync = await import('../todo-sync.js').catch(() => ({}));

const current = [
  { id: 'same', title: '不变', updatedAt: '1' },
  { id: 'changed', title: '旧', updatedAt: '1' },
  { id: 'editing', title: '本地草稿', updatedAt: '1' },
  { id: 'deleted', title: '将删除', updatedAt: '1' },
];

test('todo sync module exposes pure merge', () => {
  assert.equal(typeof todoSync.mergeTodoSnapshot, 'function');
});

test('merge preserves unchanged and protected objects while applying remote changes', () => {
  const source = structuredClone(current);
  const sameObject = source[0];
  const protectedObject = source[2];
  const remote = [
    { id: 'same', title: '不变', updatedAt: '1' },
    { id: 'changed', title: '新', updatedAt: '2' },
    { id: 'editing', title: '远端', updatedAt: '2' },
    { id: 'inserted', title: '新增', updatedAt: '1' },
  ];
  const result = todoSync.mergeTodoSnapshot(source, remote, new Set(['editing']));
  assert.equal(result.items.find((item) => item.id === 'same'), sameObject);
  assert.equal(result.items.find((item) => item.id === 'editing'), protectedObject);
  assert.equal(result.items.find((item) => item.id === 'changed').title, '新');
  assert.ok(result.items.some((item) => item.id === 'inserted'));
  assert.deepEqual(result.removedIds, ['deleted']);
  assert.equal(result.conflicts.get('editing').current.title, '远端');
});

test('remote deletion of a protected todo becomes a conflict', () => {
  const editing = [{ id: 'editing', title: '本地', updatedAt: '1' }];
  const result = todoSync.mergeTodoSnapshot(editing, [], new Set(['editing']));
  assert.equal(result.items[0], editing[0]);
  assert.equal(result.conflicts.get('editing').current, null);
});
