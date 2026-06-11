import { getAuthUser, publicUser } from '../../_lib/auth.js';
import { error, json } from '../../_lib/http.js';

export async function onRequestGet({ request, env }) {
  if (!env.DB) return error('DATABASE_UNAVAILABLE', '数据库未配置', 500);
  const user = await getAuthUser(env.DB, request, { allowPasswordChange: true });
  if (!user) return error('UNAUTHENTICATED', '请先登录', 401);
  return json({ code: 'OK', user: publicUser(user) });
}
