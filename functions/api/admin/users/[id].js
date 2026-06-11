import { requireUser, revokeUserSessions } from '../../../_lib/auth.js';
import { error, json, readJson, requireSameOrigin } from '../../../_lib/http.js';

export async function onRequestPatch({ request, env, params }) {
  if (!requireSameOrigin(request)) {
    return error('INVALID_ORIGIN', '请求来源无效', 403);
  }
  if (!env.DB) return error('DATABASE_UNAVAILABLE', '数据库未配置', 500);
  const auth = await requireUser(env.DB, request, { admin: true });
  if (auth.response) return auth.response;

  const target = await env.DB.prepare(
    'SELECT id, role, status FROM users WHERE id = ?'
  ).bind(params.id).first();
  if (!target) return error('USER_NOT_FOUND', '账号不存在', 404);

  const body = await readJson(request);
  const nextStatus = body?.status;
  if (!['active', 'disabled'].includes(nextStatus)) {
    return error('INVALID_STATUS', '账号状态无效', 400);
  }
  if (target.id === auth.user.id && nextStatus === 'disabled') {
    return error('CANNOT_DISABLE_SELF', '不能停用当前登录账号', 409);
  }
  if (target.role === 'admin' && target.status === 'active' && nextStatus === 'disabled') {
    const row = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND status = 'active'"
    ).first();
    if (Number(row?.count || 0) <= 1) {
      return error('LAST_ADMIN', '不能停用最后一个有效管理员', 409);
    }
  }

  await env.DB.prepare('UPDATE users SET status = ?, updated_at = ? WHERE id = ?')
    .bind(nextStatus, new Date().toISOString(), target.id)
    .run();
  if (nextStatus === 'disabled') await revokeUserSessions(env.DB, target.id);
  return json({ code: 'OK', status: nextStatus });
}
