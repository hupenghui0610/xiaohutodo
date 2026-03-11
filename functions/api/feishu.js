import { verifyToken } from './login.js';

const APP_ID = 'cli_a927c34524f8dbef';
const APP_TOKEN = 'OftMbXMpAapkcssDyXTc6USlnEg';
const TABLE_ID = 'tblZKtePBKg6T21x';
const DATE_FIELDS = ['date', 'weekStart', 'createdAt'];

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

async function getAccessToken(appSecret) {
  const response = await fetch(
    'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: APP_ID, app_secret: appSecret }),
    }
  );
  const data = await response.json();
  if (data.code === 0) {
    return data.tenant_access_token;
  }
  throw new Error('Failed to get access token: ' + JSON.stringify(data));
}

function fieldsToFeishu(fields) {
  const result = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === null || value === undefined) continue;
    if (DATE_FIELDS.includes(key)) {
      const ts = typeof value === 'number' ? value : new Date(value).getTime();
      if (!isNaN(ts)) result[key] = ts;
    } else {
      result[key] = value;
    }
  }
  return result;
}

// 将时间戳格式化为 YYYY-MM-DD，使用 Asia/Shanghai，与飞书表格展示的“日期”一致，避免 UTC 导致差一天
function timestampToDateString(ts) {
  return new Date(ts).toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' });
}

function fieldsFromFeishu(fields) {
  const result = {};
  for (const [key, value] of Object.entries(fields)) {
    if (DATE_FIELDS.includes(key) && typeof value === 'number') {
      if (key === 'createdAt') {
        result[key] = new Date(value).toISOString();
      } else {
        result[key] = timestampToDateString(value);
      }
    } else {
      result[key] = value;
    }
  }
  return result;
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: CORS_HEADERS });
  }

  const loginSecret = env.LOGIN_SECRET || 'xiaohu-todo-secret-2026';
  const authHeader = request.headers.get('authorization') || '';
  const userToken = authHeader.replace(/^Bearer\s+/i, '');
  const username = await verifyToken(userToken, loginSecret);
  if (!username) {
    return jsonResponse({ error: '未登录或 token 无效' }, 401);
  }

  const appSecret = env.FEISHU_APP_SECRET || 'wgWrVSmfxVfk3HDbqsk1khnAoTG5wWI4';

  try {
    const token = await getAccessToken(appSecret);
    const method = request.method;
    const url = new URL(request.url);
    const baseUrl = `https://open.feishu.cn/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}`;
    const authHeaders = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    if (method === 'GET') {
      const response = await fetch(`${baseUrl}/records?page_size=500`, {
        headers: authHeaders,
      });
      const data = await response.json();
      const rawItems = (data.code === 0 && data.data) ? (data.data.items ?? data.data.records ?? []) : [];
      if (rawItems.length > 0) {
        const items = rawItems.map((item) => {
          const recordId = item.record_id ?? item.recordId ?? item.id;
          return {
            ...item,
            record_id: recordId,
            fields: fieldsFromFeishu(item.fields || {}),
          };
        });
        if (!data.data) data.data = {};
        data.data.items = items;
      }
      return jsonResponse(data);
    }

    const body = await request.json().catch(() => ({}));

    if (method === 'DELETE') {
      const record_id = url.searchParams.get('record_id') ?? body?.record_id;
      if (!record_id) {
        return jsonResponse({ error: '缺少 record_id' }, 400);
      }
      const response = await fetch(`${baseUrl}/records/${record_id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      let data;
      try {
        const text = await response.text();
        data = text ? JSON.parse(text) : {};
      } catch {
        data = {};
      }
      if (response.ok && (data.code === undefined || data.code === 0)) {
        return jsonResponse({ code: 0, msg: 'ok' });
      }
      return jsonResponse(data, response.ok ? 200 : response.status);
    }

    if (method === 'POST') {
      if (body && body.action === 'delete') {
        const record_id = body.record_id != null ? String(body.record_id).trim() : '';
        if (!record_id) {
          return jsonResponse({ error: '删除缺少 record_id', code: -1 }, 400);
        }
        const response = await fetch(`${baseUrl}/records/${record_id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        let data;
        try {
          const text = await response.text();
          data = text ? JSON.parse(text) : {};
        } catch {
          data = {};
        }
        if (response.ok && (data.code === undefined || data.code === 0)) {
          return jsonResponse({ code: 0, msg: 'ok' });
        }
        return jsonResponse(data, response.ok ? 200 : response.status);
      }
      if (!body || !body.fields || typeof body.fields !== 'object') {
        return jsonResponse({ error: '创建待办缺少 fields', code: -1 }, 400);
      }
      const converted = { fields: fieldsToFeishu(body.fields) };
      const response = await fetch(`${baseUrl}/records`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(converted),
      });
      const data = await response.json();
      return jsonResponse(data);
    }

    if (method === 'PUT') {
      const { record_id, fields } = body;
      const converted = { fields: fieldsToFeishu(fields) };
      const response = await fetch(`${baseUrl}/records/${record_id}`, {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify(converted),
      });
      const data = await response.json();
      return jsonResponse(data);
    }

    return jsonResponse({ error: 'Method not allowed' }, 405);
  } catch (error) {
    console.error('API Error:', error);
    return jsonResponse({ error: error.message }, 500);
  }
}
