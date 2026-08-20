import { requireUser } from '../_lib/auth.js';
import { error, json, methodNotAllowed, readJson, requireSameOrigin } from '../_lib/http.js';
import { mapRevisions, revisionStatement } from '../_lib/data-revisions.js';
import { mapDocument, normalizeText, validateDocumentFields } from '../_lib/document-links.js';

const DOCUMENT_SELECT = `
  SELECT id, directory_id, title, description, created_at, updated_at
  FROM document_links
  WHERE user_id = ?
  ORDER BY created_at DESC, id ASC`;

function invalidDocument(errors) {
  return json({ code: 'INVALID_DOCUMENT', message: '文档数据无效', fields: errors }, 400);
}

async function ownedDirectory(db, directoryId, userId) {
  return db.prepare(
    'SELECT id FROM document_directories WHERE id = ? AND user_id = ?'
  ).bind(directoryId, userId).first();
}

async function ownedDocument(db, id, userId) {
  return db.prepare(
    'SELECT id FROM document_links WHERE id = ? AND user_id = ?'
  ).bind(id, userId).first();
}

async function currentDocument(db, id, userId) {
  return db.prepare(
    `SELECT id, directory_id, title, description, created_at, updated_at
     FROM document_links WHERE id = ? AND user_id = ?`
  ).bind(id, userId).first();
}

async function documentRevision(db, userId) {
  return mapRevisions(await revisionStatement(db, userId).first()).documentsRevision;
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
      const [listResult, revisionResult] = await env.DB.batch([
        env.DB.prepare(DOCUMENT_SELECT).bind(userId),
        revisionStatement(env.DB, userId),
      ]);
      const revisionRow = revisionResult.results?.[0] || null;
      return json({ code: 'OK', data: {
        documents: (listResult.results || []).map(mapDocument),
        revision: mapRevisions(revisionRow).documentsRevision,
      } });
    }

    const body = await readJson(request);
    if (method === 'POST') {
      const fields = {
        directoryId: normalizeText(body?.directoryId),
        title: normalizeText(body?.title),
        description: normalizeText(body?.description),
      };
      const errors = validateDocumentFields(fields);
      if (Object.keys(errors).length) return invalidDocument(errors);
      if (!await ownedDirectory(env.DB, fields.directoryId, userId)) {
        return error('DIRECTORY_NOT_FOUND', '目录不存在', 404);
      }
      const id = crypto.randomUUID();
      const timestamp = new Date().toISOString();
      await env.DB.prepare(
        `INSERT INTO document_links
          (id, user_id, directory_id, title, description, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(id, userId, fields.directoryId, fields.title, fields.description, timestamp, timestamp).run();
      return json({ code: 'OK', document: mapDocument({
        id, directory_id: fields.directoryId, title: fields.title, description: fields.description,
        created_at: timestamp, updated_at: timestamp,
      }), revision: await documentRevision(env.DB, userId) }, 201);
    }

    if (method === 'PUT') {
      const id = normalizeText(body?.id);
      const fields = {
        directoryId: normalizeText(body?.directoryId),
        title: normalizeText(body?.title),
        description: normalizeText(body?.description),
      };
      const errors = validateDocumentFields(fields);
      if (!id) errors.id = '缺少文档 ID';
      if (Object.keys(errors).length) return invalidDocument(errors);
      if (!await ownedDocument(env.DB, id, userId)) {
        return error('DOCUMENT_NOT_FOUND', '文档不存在', 404);
      }
      if (!await ownedDirectory(env.DB, fields.directoryId, userId)) {
        return error('DIRECTORY_NOT_FOUND', '目录不存在', 404);
      }
      const timestamp = new Date().toISOString();
      const force = body?.force === true || !normalizeText(body?.baseUpdatedAt);
      const result = await env.DB.prepare(
        `UPDATE document_links
         SET directory_id = ?, title = ?, description = ?, updated_at = ?
         WHERE id = ? AND user_id = ? AND (? = 1 OR updated_at = ?)`
      ).bind(
        fields.directoryId, fields.title, fields.description, timestamp, id, userId,
        force ? 1 : 0, normalizeText(body?.baseUpdatedAt)
      ).run();
      if (!result.meta?.changes) {
        const current = await currentDocument(env.DB, id, userId);
        return json({
          code: 'EDIT_CONFLICT', message: '该内容已在其他设备更新',
          current: current ? mapDocument(current) : null,
        }, 409);
      }
      const document = mapDocument(await currentDocument(env.DB, id, userId));
      return json({ code: 'OK', document, revision: await documentRevision(env.DB, userId) });
    }

    if (method === 'DELETE') {
      const id = new URL(request.url).searchParams.get('id') || normalizeText(body?.id);
      if (!id) return invalidDocument({ id: '缺少文档 ID' });
      const result = await env.DB.prepare(
        'DELETE FROM document_links WHERE id = ? AND user_id = ?'
      ).bind(id, userId).run();
      if (!result.meta?.changes) return error('DOCUMENT_NOT_FOUND', '文档不存在', 404);
      return json({ code: 'OK', revision: await documentRevision(env.DB, userId) });
    }

    return methodNotAllowed(['GET', 'POST', 'PUT', 'DELETE']);
  } catch (exception) {
    console.error('Document link API failed', exception);
    return error('INTERNAL_ERROR', '文档操作失败', 500);
  }
}
