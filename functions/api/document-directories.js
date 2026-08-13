import { requireUser } from '../_lib/auth.js';
import { error, json, methodNotAllowed, readJson, requireSameOrigin } from '../_lib/http.js';
import {
  INITIAL_DIRECTORY_NAMES,
  directoryNameKey,
  mapDirectory,
  normalizeText,
  validateDirectoryName,
} from '../_lib/document-links.js';

const DIRECTORY_SELECT = `
  SELECT d.id, d.name, d.created_at, d.updated_at,
         COUNT(l.id) AS document_count
  FROM document_directories d
  LEFT JOIN document_links l
    ON l.directory_id = d.id AND l.user_id = d.user_id
  WHERE d.user_id = ?
  GROUP BY d.id
  ORDER BY d.created_at ASC, d.id ASC`;

function nowIso() {
  return new Date().toISOString();
}

function isUniqueConflict(exception) {
  return /UNIQUE constraint/i.test(exception?.message || '');
}

async function ensureInitialDirectories(db, userId) {
  const state = await db.prepare(
    'SELECT user_id FROM document_directory_states WHERE user_id = ?'
  ).bind(userId).first();
  if (state) return;

  const timestamp = nowIso();
  const statements = INITIAL_DIRECTORY_NAMES.map((name, index) => db.prepare(
    `INSERT INTO document_directories
      (id, user_id, name, name_key, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(
    crypto.randomUUID(),
    userId,
    name,
    directoryNameKey(name),
    new Date(Date.parse(timestamp) + index).toISOString(),
    timestamp
  ));
  statements.push(db.prepare(
    'INSERT INTO document_directory_states (user_id, initialized_at) VALUES (?, ?)'
  ).bind(userId, timestamp));

  try {
    await db.batch(statements);
  } catch (exception) {
    const initialized = await db.prepare(
      'SELECT user_id FROM document_directory_states WHERE user_id = ?'
    ).bind(userId).first();
    if (!initialized) throw exception;
  }
}

async function listDirectories(db, userId) {
  const { results } = await db.prepare(DIRECTORY_SELECT).bind(userId).all();
  return results.map(mapDirectory);
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
      await ensureInitialDirectories(env.DB, userId);
      return json({ code: 'OK', data: { directories: await listDirectories(env.DB, userId) } });
    }

    const body = await readJson(request);
    if (method === 'POST') {
      const validationError = validateDirectoryName(body?.name);
      if (validationError) return error('INVALID_DIRECTORY', validationError, 400);
      const name = normalizeText(body.name);
      const timestamp = nowIso();
      const id = crypto.randomUUID();
      await env.DB.prepare(
        `INSERT INTO document_directories
          (id, user_id, name, name_key, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(id, userId, name, directoryNameKey(name), timestamp, timestamp).run();
      return json({ code: 'OK', directory: mapDirectory({
        id, name, document_count: 0, created_at: timestamp, updated_at: timestamp,
      }) }, 201);
    }

    if (method === 'PUT') {
      const id = normalizeText(body?.id);
      const validationError = validateDirectoryName(body?.name);
      if (!id || validationError) return error('INVALID_DIRECTORY', validationError || '缺少目录 ID', 400);
      const name = normalizeText(body.name);
      const timestamp = nowIso();
      const result = await env.DB.prepare(
        `UPDATE document_directories
         SET name = ?, name_key = ?, updated_at = ?
         WHERE id = ? AND user_id = ?`
      ).bind(name, directoryNameKey(name), timestamp, id, userId).run();
      if (!result.meta?.changes) return error('DIRECTORY_NOT_FOUND', '目录不存在', 404);
      return json({ code: 'OK', directory: mapDirectory({
        id, name, document_count: 0, created_at: '', updated_at: timestamp,
      }) });
    }

    if (method === 'DELETE') {
      const id = new URL(request.url).searchParams.get('id') || normalizeText(body?.id);
      if (!id) return error('INVALID_DIRECTORY', '缺少目录 ID', 400);
      const result = await env.DB.prepare(
        `DELETE FROM document_directories
         WHERE id = ? AND user_id = ?
           AND NOT EXISTS (
             SELECT 1 FROM document_links
             WHERE directory_id = ? AND user_id = ?
           )`
      ).bind(id, userId, id, userId).run();
      if (result.meta?.changes) return json({ code: 'OK' });

      const owned = await env.DB.prepare(
        'SELECT id FROM document_directories WHERE id = ? AND user_id = ?'
      ).bind(id, userId).first();
      if (!owned) return error('DIRECTORY_NOT_FOUND', '目录不存在', 404);
      const containsDocuments = await env.DB.prepare(
        'SELECT 1 FROM document_links WHERE directory_id = ? AND user_id = ? LIMIT 1'
      ).bind(id, userId).first();
      if (containsDocuments) {
        return error('DIRECTORY_NOT_EMPTY', '请先删除或移动目录内的文档链接', 409);
      }
      return error('DIRECTORY_DELETE_FAILED', '目录删除失败', 409);
    }

    return methodNotAllowed(['GET', 'POST', 'PUT', 'DELETE']);
  } catch (exception) {
    if (isUniqueConflict(exception)) {
      return error('DIRECTORY_NAME_CONFLICT', '目录名称已存在', 409);
    }
    console.error('Document directory API failed', exception);
    return error('INTERNAL_ERROR', '目录操作失败', 500);
  }
}
