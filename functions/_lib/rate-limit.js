const WINDOW_SECONDS = 15 * 60;
const MAX_FAILURES = 5;

function addSeconds(date, seconds) {
  return new Date(date.getTime() + seconds * 1000).toISOString();
}

export function loginSubjects(request, username) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  return [`username:${username}`, `ip:${ip}`];
}

export async function isLoginBlocked(db, subjects) {
  const now = new Date().toISOString();
  for (const subject of subjects) {
    const row = await db.prepare(
      'SELECT failed_count, locked_until FROM login_attempts WHERE subject = ?'
    ).bind(subject).first();
    if (row?.locked_until && row.locked_until > now) return true;
  }
  return false;
}

export async function recordLoginFailure(db, subjects) {
  const now = new Date();
  for (const subject of subjects) {
    const row = await db.prepare(
      'SELECT failed_count, window_started_at FROM login_attempts WHERE subject = ?'
    ).bind(subject).first();
    const windowExpired =
      !row || new Date(row.window_started_at).getTime() <= now.getTime() - WINDOW_SECONDS * 1000;
    const failedCount = windowExpired ? 1 : Number(row.failed_count) + 1;
    const windowStartedAt = windowExpired ? now.toISOString() : row.window_started_at;
    const lockedUntil = failedCount >= MAX_FAILURES ? addSeconds(now, WINDOW_SECONDS) : null;
    await db.prepare(
      `INSERT INTO login_attempts (subject, failed_count, window_started_at, locked_until)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(subject) DO UPDATE SET
         failed_count = excluded.failed_count,
         window_started_at = excluded.window_started_at,
         locked_until = excluded.locked_until`
    ).bind(subject, failedCount, windowStartedAt, lockedUntil).run();
  }
}

export async function clearLoginFailures(db, subjects) {
  for (const subject of subjects) {
    await db.prepare('DELETE FROM login_attempts WHERE subject = ?').bind(subject).run();
  }
}
