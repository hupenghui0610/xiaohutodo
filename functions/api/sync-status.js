import { requireUser } from '../_lib/auth.js';
import { mapRevisions, revisionStatement } from '../_lib/data-revisions.js';
import { error, json, methodNotAllowed } from '../_lib/http.js';

export async function onRequest({ request, env }) {
  if (!env.DB) return error('DATABASE_UNAVAILABLE', '数据库未配置', 500);
  if (request.method !== 'GET') return methodNotAllowed(['GET']);

  const auth = await requireUser(env.DB, request);
  if (auth.response) return auth.response;

  try {
    const row = await revisionStatement(env.DB, auth.user.id).first();
    return json({ code: 'OK', data: mapRevisions(row) });
  } catch (exception) {
    console.error('Sync status API failed', exception);
    return error('INTERNAL_ERROR', '同步状态读取失败', 500);
  }
}
