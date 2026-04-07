import { verifyToken } from './login.js';

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

  // 获取 D1 数据库实例
  const db = env.DB;
  if (!db) {
    return jsonResponse({ error: '数据库未配置' }, 500);
  }

  try {
    const method = request.method;

    // GET: 获取所有待办
    if (method === 'GET') {
      const { results } = await db.prepare(
        'SELECT id, type, title, done, date, weekStart, delayed, createdAt FROM todos ORDER BY createdAt DESC'
      ).all();

      // 转换 done 和 delayed 为布尔值（前端期望布尔值）
      const todos = results.map(row => ({
        id: row.id,
        type: row.type,
        title: row.title,
        done: Boolean(row.done),
        date: row.date,
        weekStart: row.weekStart,
        delayed: Boolean(row.delayed),
        createdAt: row.createdAt,
      }));

      return jsonResponse({ code: 0, data: { items: todos } });
    }

    const body = await request.json().catch(() => ({}));

    // POST: 创建待办 或 删除待办（action=delete）
    if (method === 'POST') {
      // 删除操作
      if (body && body.action === 'delete') {
        const id = body.id || body.record_id;
        if (!id) {
          return jsonResponse({ error: '删除缺少 id', code: -1 }, 400);
        }

        await db.prepare('DELETE FROM todos WHERE id = ?').bind(id).run();
        return jsonResponse({ code: 0, msg: 'ok' });
      }

      // 创建操作
      if (!body || !body.fields || typeof body.fields !== 'object') {
        return jsonResponse({ error: '创建待办缺少 fields', code: -1 }, 400);
      }

      const { id, type, title, done, date, weekStart, delayed, createdAt } = body.fields;

      if (!id || !type || !title) {
        return jsonResponse({ error: '缺少必要字段: id, type, title', code: -1 }, 400);
      }

      await db.prepare(
        `INSERT INTO todos (id, type, title, done, date, weekStart, delayed, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        id,
        type,
        title,
        done ? 1 : 0,
        date || null,
        weekStart || null,
        delayed ? 1 : 0,
        createdAt || new Date().toISOString()
      ).run();

      return jsonResponse({ code: 0, msg: 'created' });
    }

    // PUT: 更新待办
    if (method === 'PUT') {
      const { id, fields } = body;

      if (!id || !fields || typeof fields !== 'object') {
        return jsonResponse({ error: '更新待办缺少 id 或 fields', code: -1 }, 400);
      }

      // 构建动态更新语句
      const updates = [];
      const values = [];

      if (fields.type !== undefined) {
        updates.push('type = ?');
        values.push(fields.type);
      }
      if (fields.title !== undefined) {
        updates.push('title = ?');
        values.push(fields.title);
      }
      if (fields.done !== undefined) {
        updates.push('done = ?');
        values.push(fields.done ? 1 : 0);
      }
      if (fields.date !== undefined) {
        updates.push('date = ?');
        values.push(fields.date);
      }
      if (fields.weekStart !== undefined) {
        updates.push('weekStart = ?');
        values.push(fields.weekStart);
      }
      if (fields.delayed !== undefined) {
        updates.push('delayed = ?');
        values.push(fields.delayed ? 1 : 0);
      }
      if (fields.createdAt !== undefined) {
        updates.push('createdAt = ?');
        values.push(fields.createdAt);
      }

      if (updates.length === 0) {
        return jsonResponse({ error: '没有要更新的字段', code: -1 }, 400);
      }

      values.push(id); // WHERE 条件

      await db.prepare(
        `UPDATE todos SET ${updates.join(', ')} WHERE id = ?`
      ).bind(...values).run();

      return jsonResponse({ code: 0, msg: 'updated' });
    }

    // DELETE: 删除待办（直接删除方式）
    if (method === 'DELETE') {
      const url = new URL(request.url);
      const id = url.searchParams.get('id') || body?.id;

      if (!id) {
        return jsonResponse({ error: '缺少 id', code: -1 }, 400);
      }

      await db.prepare('DELETE FROM todos WHERE id = ?').bind(id).run();
      return jsonResponse({ code: 0, msg: 'deleted' });
    }

    return jsonResponse({ error: 'Method not allowed' }, 405);
  } catch (error) {
    console.error('D1 API Error:', error);
    return jsonResponse({ error: error.message }, 500);
  }
}
