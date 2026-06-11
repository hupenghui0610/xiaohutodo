import { requireUser } from '../_lib/auth.js';
import { error, json, readJson, requireSameOrigin } from '../_lib/http.js';

const SELECT_FIELDS = 'id, type, title, done, date, weekStart, delayed, createdAt';

function mapTodo(row) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    done: Boolean(row.done),
    date: row.date,
    weekStart: row.weekStart,
    delayed: Boolean(row.delayed),
    createdAt: row.createdAt,
  };
}

function validateTodo(fields, creating = false) {
  if (!fields || typeof fields !== 'object') return '待办数据无效';
  if (creating && (!fields.id || !fields.type || !fields.title)) {
    return '缺少必要字段';
  }
  if (fields.type !== undefined && !['A', 'B', 'C'].includes(fields.type)) {
    return '待办类型无效';
  }
  if (fields.title !== undefined) {
    if (typeof fields.title !== 'string' || !fields.title.trim() || fields.title.length > 500) {
      return '待办标题须为 1-500 个字符';
    }
  }
  return '';
}

export async function onRequest({ request, env }) {
  if (!env.DB) return error('DATABASE_UNAVAILABLE', '数据库未配置', 500);
  const method = request.method;
  if (method !== 'GET' && !requireSameOrigin(request)) {
    return error('INVALID_ORIGIN', '请求来源无效', 403);
  }

  const auth = await requireUser(env.DB, request);
  if (auth.response) return auth.response;
  const userId = auth.user.id;

  try {
    if (method === 'GET') {
      const { results } = await env.DB.prepare(
        `SELECT ${SELECT_FIELDS}
         FROM todos WHERE user_id = ? ORDER BY createdAt DESC`
      ).bind(userId).all();
      return json({ code: 'OK', data: { items: results.map(mapTodo) } });
    }

    const body = await readJson(request);
    if (method === 'POST') {
      const validationError = validateTodo(body?.fields, true);
      if (validationError) return error('INVALID_TODO', validationError, 400);
      const fields = body.fields;
      await env.DB.prepare(
        `INSERT INTO todos
         (id, user_id, type, title, done, date, weekStart, delayed, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        fields.id,
        userId,
        fields.type,
        fields.title.trim(),
        fields.done ? 1 : 0,
        fields.date || null,
        fields.weekStart || null,
        fields.delayed ? 1 : 0,
        fields.createdAt || new Date().toISOString()
      ).run();
      return json({ code: 'OK', todo: mapTodo({ ...fields }) }, 201);
    }

    if (method === 'PUT') {
      const id = body?.id;
      const fields = body?.fields;
      const validationError = validateTodo(fields);
      if (!id || validationError) {
        return error('INVALID_TODO', validationError || '缺少待办 ID', 400);
      }

      const updates = [];
      const values = [];
      for (const [key, value] of Object.entries(fields)) {
        if (!['type', 'title', 'done', 'date', 'weekStart', 'delayed', 'createdAt'].includes(key)) {
          continue;
        }
        updates.push(`${key} = ?`);
        values.push(
          key === 'done' || key === 'delayed'
            ? (value ? 1 : 0)
            : (key === 'title' ? value.trim() : value)
        );
      }
      if (!updates.length) return error('NO_CHANGES', '没有可更新字段', 400);
      values.push(id, userId);
      const result = await env.DB.prepare(
        `UPDATE todos SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`
      ).bind(...values).run();
      if (!result.meta?.changes) return error('TODO_NOT_FOUND', '待办不存在', 404);
      return json({ code: 'OK' });
    }

    if (method === 'DELETE') {
      const url = new URL(request.url);
      const id = url.searchParams.get('id') || body?.id;
      if (!id) return error('INVALID_TODO', '缺少待办 ID', 400);
      const result = await env.DB.prepare(
        'DELETE FROM todos WHERE id = ? AND user_id = ?'
      ).bind(id, userId).run();
      if (!result.meta?.changes) return error('TODO_NOT_FOUND', '待办不存在', 404);
      return json({ code: 'OK' });
    }

    return error('METHOD_NOT_ALLOWED', '请求方法不受支持', 405);
  } catch (exception) {
    console.error('Todo API failed', exception);
    return error('INTERNAL_ERROR', '待办操作失败', 500);
  }
}
