export function createSyncCoordinator({
  requestStatus,
  onStatus,
  documentRef = document,
  windowRef = window,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  random = Math.random,
  now = Date.now,
  intervalMs = 60_000,
  jitterMs = 5_000,
  focusDedupeMs = 250,
}) {
  let running = false;
  let generation = 0;
  let inFlight = null;
  let timerId = null;
  let lastResumeAt = -Infinity;

  function clearScheduled() {
    if (timerId === null) return;
    clearTimer(timerId);
    timerId = null;
  }

  function schedule() {
    clearScheduled();
    if (!running || documentRef.hidden) return;
    const delay = intervalMs + Math.floor(random() * jitterMs);
    timerId = setTimer(() => {
      timerId = null;
      checkNow();
    }, delay);
  }

  async function runCheck(operationGeneration) {
    try {
      const status = await requestStatus();
      if (!running || operationGeneration !== generation) return false;
      await onStatus(status);
      return true;
    } catch {
      return false;
    } finally {
      if (operationGeneration === generation) {
        inFlight = null;
        schedule();
      }
    }
  }

  function checkNow() {
    if (!running || documentRef.hidden) return Promise.resolve(false);
    if (inFlight) return inFlight;
    clearScheduled();
    inFlight = runCheck(generation);
    return inFlight;
  }

  function handleHiddenChange() {
    if (documentRef.hidden) {
      clearScheduled();
      return;
    }
    handleResume();
  }

  function handleResume() {
    if (!running || documentRef.hidden) return;
    const timestamp = now();
    if (timestamp - lastResumeAt < focusDedupeMs) return;
    lastResumeAt = timestamp;
    checkNow();
  }

  function start() {
    if (running) return;
    running = true;
    generation += 1;
    documentRef.addEventListener('visibilitychange', handleHiddenChange);
    windowRef.addEventListener('focus', handleResume);
    if (!documentRef.hidden) checkNow();
  }

  function stop() {
    if (!running) return;
    running = false;
    generation += 1;
    clearScheduled();
    inFlight = null;
    documentRef.removeEventListener('visibilitychange', handleHiddenChange);
    windowRef.removeEventListener('focus', handleResume);
  }

  return { start, stop, checkNow };
}
