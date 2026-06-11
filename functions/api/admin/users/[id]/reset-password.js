import { requireUser, revokeUserSessions } from '../../../../_lib/auth.js';
import { error, json, readJson, requireSameOrigin } from '../../../../_lib/http.js';
import {
  generateTemporaryPassword,
  hashPassword,
  validatePassword,
} from '../../../../_lib/security.js';

export async function onRequestPost({ request, env, params }) {
  if (!requireSameOrigin(request)) {
    return error('INVALID_ORIGIN', '请求来源无效', 403);
  }
  if (!env.DB) return error('DATABASE_UNAVAILABLE', '数据库未配置', 500);
  const auth = await requireUser(env.DB, request, { admin: true });
  if (auth.response) return auth.response;

  const target = await env.DB.prepare('SELECT id FROM users WHERE id = ?')
    .bind(params.id)
    .first();
  if (!target) return error('USER_NOT_FOUND', '账号不存在', 404);

  const body = await readJson(request);
  const temporaryPassword = body?.temporaryPassword || generateTemporaryPassword();
  const passwordError = validatePassword(temporaryPassword);
  if (passwordError) return error('INVALID_PASSWORD', passwordError, 400);

  const password = await hashPassword(temporaryPassword);
  await env.DB.prepare(
    `UPDATE users
     SET password_hash = ?, password_salt = ?, password_iterations = ?,
         legacy_password_hash = NULL, must_change_password = 1, updated_at = ?
     WHERE id = ?`
  ).bind(
    password.hash,
    password.salt,
    password.iterations,
    new Date().toISOString(),
    target.id
  ).run();
  await revokeUserSessions(env.DB, target.id);
  return json({ code: 'OK', temporaryPassword });
}
