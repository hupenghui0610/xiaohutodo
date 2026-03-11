const APP_ID = 'cli_a927c34524f8dbef';
const APP_SECRET = process.env.FEISHU_APP_SECRET || 'wgWrVSmfxVfk3HDbqsk1khnAoTG5wWI4';
const APP_TOKEN = 'OftMbXMpAapkcssDyXTc6USlnEg';
const TABLE_ID = 'tblZKtePBKg6T21x';

const DATE_FIELDS = ['date', 'weekStart', 'createdAt'];

let accessToken = null;
let tokenExpireTime = 0;

async function getAccessToken() {
  const now = Date.now();
  if (accessToken && now < tokenExpireTime) {
    return accessToken;
  }

  const response = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: APP_ID, app_secret: APP_SECRET }),
  });

  const data = await response.json();
  if (data.code === 0) {
    accessToken = data.tenant_access_token;
    tokenExpireTime = now + (data.expire - 60) * 1000;
    return accessToken;
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

function fieldsFromFeishu(fields) {
  const result = {};
  for (const [key, value] of Object.entries(fields)) {
    if (DATE_FIELDS.includes(key) && typeof value === 'number') {
      if (key === 'createdAt') {
        result[key] = new Date(value).toISOString();
      } else {
        const d = new Date(value);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        result[key] = `${y}-${m}-${dd}`;
      }
    } else {
      result[key] = value;
    }
  }
  return result;
}

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

module.exports = async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { verifyToken } = require('./login.js');
  const authHeader = req.headers['authorization'] || '';
  const userToken = authHeader.replace(/^Bearer\s+/i, '');
  const username = verifyToken(userToken);
  if (!username) {
    return res.status(401).json({ error: '未登录或 token 无效' });
  }

  try {
    const token = await getAccessToken();
    const { method, body } = req;
    const baseUrl = `https://open.feishu.cn/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}`;
    const authHeaders = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

    if (method === 'GET') {
      const response = await fetch(`${baseUrl}/records?page_size=500`, { headers: authHeaders });
      const data = await response.json();
      const rawItems = (data.code === 0 && data.data) ? (data.data.items ?? data.data.records ?? []) : [];
      if (rawItems.length > 0) {
        const items = rawItems.map(item => {
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
      return res.status(200).json(data);
    }

    if (method === 'POST') {
      if (body && body.action === 'delete') {
        const record_id = body.record_id != null ? String(body.record_id).trim() : '';
        if (!record_id) {
          return res.status(400).json({ error: '删除缺少 record_id', code: -1 });
        }
        const response = await fetch(`${baseUrl}/records/${record_id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` },
        });
        let data;
        try {
          const text = await response.text();
          data = text ? JSON.parse(text) : {};
        } catch (e) {
          data = {};
        }
        if (response.ok && (data.code === undefined || data.code === 0)) {
          return res.status(200).json({ code: 0, msg: 'ok' });
        }
        return res.status(response.ok ? 200 : response.status).json(data);
      }
      if (!body || !body.fields || typeof body.fields !== 'object') {
        return res.status(400).json({ error: '创建待办缺少 fields', code: -1 });
      }
      const converted = { fields: fieldsToFeishu(body.fields) };
      const response = await fetch(`${baseUrl}/records`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(converted),
      });
      const data = await response.json();
      return res.status(200).json(data);
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
      return res.status(200).json(data);
    }

    if (method === 'DELETE') {
      const record_id = req.query?.record_id ?? body?.record_id;
      if (!record_id) {
        return res.status(400).json({ error: '缺少 record_id' });
      }
      const response = await fetch(`${baseUrl}/records/${record_id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      let data;
      try {
        const text = await response.text();
        data = text ? JSON.parse(text) : {};
      } catch (e) {
        data = {};
      }
      if (response.ok && (data.code === undefined || data.code === 0)) {
        return res.status(200).json({ code: 0, msg: 'ok' });
      }
      return res.status(response.ok ? 200 : response.status).json(data);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
