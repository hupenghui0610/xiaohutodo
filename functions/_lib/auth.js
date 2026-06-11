import { error } from './http.js';
import { randomHex, sha256 } from './security.js';

export const SESSION_COOKIE = 'xiaohu_session';
const IDLE_TTL_SECONDS = 7 * 24 * 60 * 60;
const ABSOLUTE_TTL_SECONDS = 30 * 24 * 60 * 60;

function nowIso() {
  return new Date().toISOString();
}

function addSeconds(date, seconds) {
  return new Date(date.getTime() + seconds * 1000).toISOString();
}

function parseCookies(request) {
  const result = {};
  const header = request.headers.get('Cookie') || '';
  for (const item of header.split(';')) {
    const index = item.indexOf('=');
    if (index < 0) continue;
    result[item.slice(0, index).trim()] = decodeURIComponent(item.slice(index + 1).trim());
  }
  return result;
}

export function sessionCookie(token, maxAge = ABSOLUTE_TTL_SECONDS) {
  return [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${maxAge}`,
  ].join('; ');
}

export function clearSessionCookie() {
  return sessionCookie('', 0);
}

export async function createSession(db, userId, request) {
  const token = randomHex(32);
  const tokenHash = await sha256(token);
  const createdAt = new Date();
  await db.prepare(
    `INSERT INTO sessions
      (id, token_hash, user_id, created_at, last_active_at, idle_expires_at, absolute_expires_at, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    crypto.randomUUID(),
    tokenHash,
    userId,
    createdAt.toISOString(),
    createdAt.toISOString(),
    addSeconds(createdAt, IDLE_TTL_SECONDS),
    addSeconds(createdAt, ABSOLUTE_TTL_SECONDS),
    request.headers.get('CF-Connecting-IP') || '',
    (request.headers.get('User-Agent') || '').slice(0, 300)
  ).run();
  return token;
}

export async function revokeRequestSession(db, request) {
  const token = parseCookies(request)[SESSION_COOKIE];
  if (!token) return;
  await db.prepare('DELETE FROM sessions WHERE token_hash = ?')
    .bind(await sha256(token))
    .run();
}

export async function revokeUserSessions(db, userId) {
  await db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run();
}

export async function getAuthUser(db, request, options = {}) {
  const token = parseCookies(request)[SESSION_COOKIE];
  if (!token) return null;

  const tokenHash = await sha256(token);
  const now = nowIso();
  const row = await db.prepare(
    `SELECT
       u.id, u.username, u.role, u.status, u.must_change_password,
       s.id AS session_id, s.absolute_expires_at
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ?
       AND s.idle_expires_at > ?
       AND s.absolute_expires_at > ?
       AND u.status = 'active'`
  ).bind(tokenHash, now, now).first();

  if (!row) {
    await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
    return null;
  }

  if (row.must_change_password && !options.allowPasswordChange) {
    return { ...row, passwordChangeRequired: true };
  }

  const idleExpiry = addSeconds(new Date(), IDLE_TTL_SECONDS);
  await db.prepare(
    'UPDATE sessions SET last_active_at = ?, idle_expires_at = ? WHERE id = ?'
  ).bind(now, idleExpiry, row.session_id).run();

  return row;
}

export async function requireUser(db, request, options = {}) {
  const user = await getAuthUser(db, request, options);
  if (!user) {
    return { response: error('UNAUTHENTICATED', '请先登录', 401) };
  }
  if (user.passwordChangeRequired) {
    return {
      response: error('PASSWORD_CHANGE_REQUIRED', '请先修改临时密码', 403),
    };
  }
  if (options.admin && user.role !== 'admin') {
    return { response: error('FORBIDDEN', '没有管理员权限', 403) };
  }
  return { user };
}

export function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    mustChangePassword: Boolean(user.must_change_password),
  };
}
