import { clearSessionCookie, revokeRequestSession } from '../../_lib/auth.js';
import { error, json, requireSameOrigin } from '../../_lib/http.js';

export async function onRequestPost({ request, env }) {
  if (!requireSameOrigin(request)) {
    return error('INVALID_ORIGIN', '请求来源无效', 403);
  }
  if (env.DB) await revokeRequestSession(env.DB, request);
  return json({ code: 'OK' }, 200, { 'Set-Cookie': clearSessionCookie() });
}
