export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers,
    },
  });
}

export function error(code, message, status = 400) {
  return json({ code, message }, status);
}

export function methodNotAllowed(allowed) {
  return json(
    { code: 'METHOD_NOT_ALLOWED', message: '请求方法不受支持' },
    405,
    { Allow: allowed.join(', ') }
  );
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export function requireSameOrigin(request) {
  const origin = request.headers.get('Origin');
  const expected = new URL(request.url).origin;
  return origin === expected;
}
