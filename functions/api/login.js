const ACCOUNTS = [
  {
    username: 'hupenghui',
    passwordHash: '15dede3fbce896818be87fd3440d69f83601144367bcd64367e847feb2a52e40',
  },
];

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function bufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function sha256(str) {
  const data = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return bufferToHex(hash);
}

async function hmacSha256(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return bufferToHex(sig);
}

async function generateToken(username, secret) {
  const hmac = await hmacSha256(secret, username);
  return username + ':' + hmac;
}

export async function verifyToken(token, secret) {
  if (!token) return null;
  const idx = token.indexOf(':');
  if (idx === -1) return null;
  const username = token.substring(0, idx);
  const expected = await generateToken(username, secret);
  if (token === expected) return username;
  return null;
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: CORS_HEADERS });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const loginSecret = env.LOGIN_SECRET || 'xiaohu-todo-secret-2026';

  try {
    const body = await request.json();
    const { username, password } = body || {};

    if (!username || !password) {
      return jsonResponse({ error: '请输入用户名和密码' }, 400);
    }

    const account = ACCOUNTS.find((a) => a.username === username);
    if (!account) {
      return jsonResponse({ error: '用户名或密码错误' }, 401);
    }

    const inputHash = await sha256(password);
    if (inputHash !== account.passwordHash) {
      return jsonResponse({ error: '用户名或密码错误' }, 401);
    }

    const token = await generateToken(username, loginSecret);
    return jsonResponse({ token, username });
  } catch (error) {
    console.error('Login Error:', error);
    return jsonResponse({ error: '服务器错误' }, 500);
  }
}
