import { requireUser } from '../../../_lib/auth.js';
import { error, json, readJson, requireSameOrigin } from '../../../_lib/http.js';
import {
  generateTemporaryPassword,
  hashPassword,
  normalizeUsername,
  validatePassword,
  validateUsername,
} from '../../../_lib/security.js';

function mapUser(row) {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    status: row.status,
    mustChangePassword: Boolean(row.must_change_password),
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  };
}

export async function onRequestGet({ request, env }) {
  if (!env.DB) return error('DATABASE_UNAVAILABLE', '数据库未配置', 500);
  const auth = await requireUser(env.DB, request, { admin: true });
  if (auth.response) return auth.response;

  const { results } = await env.DB.prepare(
    `SELECT id, username, role, status, must_change_password, created_at, last_login_at
     FROM users ORDER BY role DESC, created_at ASC`
  ).all();
  return json({ code: 'OK', users: results.map(mapUser) });
}

export async function onRequestPost({ request, env }) {
  if (!requireSameOrigin(request)) {
    return error('INVALID_ORIGIN', '请求来源无效', 403);
  }
  if (!env.DB) return error('DATABASE_UNAVAILABLE', '数据库未配置', 500);
  const auth = await requireUser(env.DB, request, { admin: true });
  if (auth.response) return auth.response;

  const body = await readJson(request);
  const username = normalizeUsername(body?.username);
  const usernameError = validateUsername(username);
  if (usernameError) return error('INVALID_USERNAME', usernameError, 400);

  const role = body?.role === 'admin' ? 'admin' : 'user';
  const temporaryPassword = body?.temporaryPassword || generateTemporaryPassword();
  const passwordError = validatePassword(temporaryPassword);
  if (passwordError) return error('INVALID_PASSWORD', passwordError, 400);

  const password = await hashPassword(temporaryPassword);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  try {
    await env.DB.prepare(
      `INSERT INTO users
       (id, username, password_hash, password_salt, password_iterations,
        role, status, must_change_password, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'active', 1, ?, ?)`
    ).bind(
      id,
      username,
      password.hash,
      password.salt,
      password.iterations,
      role,
      now,
      now
    ).run();
  } catch (exception) {
    if (String(exception).toLowerCase().includes('unique')) {
      return error('USERNAME_TAKEN', '用户名已存在', 409);
    }
    console.error('Create user failed', exception);
    return error('INTERNAL_ERROR', '创建账号失败', 500);
  }

  return json(
    {
      code: 'OK',
      user: mapUser({
        id,
        username,
        role,
        status: 'active',
        must_change_password: 1,
        created_at: now,
        last_login_at: null,
      }),
      temporaryPassword,
    },
    201
  );
}
