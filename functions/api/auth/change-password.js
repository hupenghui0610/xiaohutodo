import {
  clearSessionCookie,
  requireUser,
  revokeUserSessions,
} from '../../_lib/auth.js';
import { error, json, readJson, requireSameOrigin } from '../../_lib/http.js';
import {
  hashPassword,
  validatePassword,
  verifyPassword,
} from '../../_lib/security.js';

export async function onRequestPost({ request, env }) {
  if (!requireSameOrigin(request)) {
    return error('INVALID_ORIGIN', '请求来源无效', 403);
  }
  if (!env.DB) return error('DATABASE_UNAVAILABLE', '数据库未配置', 500);

  const auth = await requireUser(env.DB, request, { allowPasswordChange: true });
  if (auth.response) return auth.response;

  const body = await readJson(request);
  const currentPassword = body?.currentPassword;
  const newPassword = body?.newPassword;
  const passwordError = validatePassword(newPassword);
  if (passwordError) return error('INVALID_PASSWORD', passwordError, 400);
  if (currentPassword === newPassword) {
    return error('PASSWORD_UNCHANGED', '新密码不能与当前密码相同', 400);
  }

  const stored = await env.DB.prepare(
    `SELECT password_hash, password_salt, password_iterations, legacy_password_hash
     FROM users WHERE id = ?`
  ).bind(auth.user.id).first();
  if (!stored || !(await verifyPassword(currentPassword, stored))) {
    return error('INVALID_CREDENTIALS', '当前密码错误', 401);
  }

  const result = await hashPassword(newPassword);
  await env.DB.prepare(
    `UPDATE users
     SET password_hash = ?, password_salt = ?, password_iterations = ?,
         legacy_password_hash = NULL, must_change_password = 0, updated_at = ?
     WHERE id = ?`
  ).bind(
    result.hash,
    result.salt,
    result.iterations,
    new Date().toISOString(),
    auth.user.id
  ).run();
  await revokeUserSessions(env.DB, auth.user.id);
  return json(
    { code: 'OK', message: '密码已修改，请重新登录' },
    200,
    { 'Set-Cookie': clearSessionCookie() }
  );
}
