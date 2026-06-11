import { createSession, sessionCookie } from '../../_lib/auth.js';
import { error, json, readJson, requireSameOrigin } from '../../_lib/http.js';
import {
  hashPassword,
  normalizeUsername,
  validateUsername,
  verifyPassword,
} from '../../_lib/security.js';
import {
  clearLoginFailures,
  isLoginBlocked,
  loginSubjects,
  recordLoginFailure,
} from '../../_lib/rate-limit.js';

export async function onRequestPost({ request, env }) {
  if (!requireSameOrigin(request)) {
    return error('INVALID_ORIGIN', '请求来源无效', 403);
  }
  if (!env.DB) return error('DATABASE_UNAVAILABLE', '数据库未配置', 500);

  const body = await readJson(request);
  const username = normalizeUsername(body?.username);
  const password = body?.password;
  const subjects = loginSubjects(request, username || 'invalid');

  if (validateUsername(username) || typeof password !== 'string') {
    await recordLoginFailure(env.DB, subjects);
    return error('INVALID_CREDENTIALS', '用户名或密码错误', 401);
  }
  if (await isLoginBlocked(env.DB, subjects)) {
    return error('LOGIN_RATE_LIMITED', '尝试次数过多，请 15 分钟后再试', 429);
  }

  const user = await env.DB.prepare(
    `SELECT id, username, password_hash, password_salt, legacy_password_hash,
            role, status, must_change_password
     FROM users WHERE username = ?`
  ).bind(username).first();

  if (!user || user.status !== 'active' || !(await verifyPassword(password, user))) {
    await recordLoginFailure(env.DB, subjects);
    return error('INVALID_CREDENTIALS', '用户名或密码错误', 401);
  }

  const now = new Date().toISOString();
  if (user.legacy_password_hash) {
    const upgraded = await hashPassword(password);
    await env.DB.prepare(
      `UPDATE users
       SET password_hash = ?, password_salt = ?, password_iterations = ?,
           legacy_password_hash = NULL, must_change_password = 1, updated_at = ?
       WHERE id = ?`
    ).bind(upgraded.hash, upgraded.salt, upgraded.iterations, now, user.id).run();
    user.must_change_password = 1;
  }

  await env.DB.prepare('UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?')
    .bind(now, now, user.id)
    .run();
  await clearLoginFailures(env.DB, subjects);
  const token = await createSession(env.DB, user.id, request);

  return json(
    {
      code: 'OK',
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        mustChangePassword: Boolean(user.must_change_password),
      },
    },
    200,
    { 'Set-Cookie': sessionCookie(token) }
  );
}
