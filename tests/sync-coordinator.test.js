import assert from 'node:assert/strict';
import test from 'node:test';

const coordinatorModule = await import('../sync-coordinator.js').catch(() => ({}));

function setup({ hidden = false } = {}) {
  const documentRef = new EventTarget();
  documentRef.hidden = hidden;
  const windowRef = new EventTarget();
  const timers = new Map();
  let timerId = 0;
  let now = 1000;
  const statusCalls = [];
  const applied = [];
  const coordinator = coordinatorModule.createSyncCoordinator?.({
    requestStatus: async () => {
      statusCalls.push(true);
      return { todosRevision: statusCalls.length };
    },
    onStatus: async (status) => applied.push(status),
    documentRef,
    windowRef,
    setTimer(callback, delay) { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
    clearTimer(id) { timers.delete(id); },
    random: () => 0,
    now: () => now,
    intervalMs: 60_000,
    jitterMs: 5_000,
    focusDedupeMs: 250,
  });
  return {
    coordinator, documentRef, windowRef, timers, statusCalls, applied,
    setNow(value) { now = value; },
  };
}

test('coordinator module exposes its factory', () => {
  assert.equal(typeof coordinatorModule.createSyncCoordinator, 'function');
});

test('start checks immediately and schedules the next visible check', async () => {
  const context = setup();
  context.coordinator.start();
  await context.coordinator.checkNow();
  assert.equal(context.statusCalls.length, 1);
  assert.deepEqual(context.applied, [{ todosRevision: 1 }]);
  assert.deepEqual([...context.timers.values()].map(({ delay }) => delay), [60_000]);
});

test('hidden pages pause and one resume event checks immediately', async () => {
  const context = setup({ hidden: true });
  context.coordinator.start();
  assert.equal(context.statusCalls.length, 0);
  assert.equal(context.timers.size, 0);

  context.documentRef.hidden = false;
  context.documentRef.dispatchEvent(new Event('visibilitychange'));
  context.windowRef.dispatchEvent(new Event('focus'));
  await context.coordinator.checkNow();
  assert.equal(context.statusCalls.length, 1);
});

test('stop removes timers and prevents future checks', async () => {
  const context = setup();
  context.coordinator.start();
  await context.coordinator.checkNow();
  context.coordinator.stop();
  assert.equal(context.timers.size, 0);
  context.setNow(2000);
  context.windowRef.dispatchEvent(new Event('focus'));
  assert.equal(context.statusCalls.length, 1);
});
