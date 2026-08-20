export const ZERO_REVISIONS = Object.freeze({
  todosRevision: 0,
  directoriesRevision: 0,
  documentsRevision: 0,
});

export function revisionStatement(db, userId) {
  return db.prepare(
    `SELECT todos_revision, directories_revision, documents_revision
     FROM user_data_revisions WHERE user_id = ?`
  ).bind(userId);
}

export function mapRevisions(row) {
  return {
    todosRevision: Number(row?.todos_revision || 0),
    directoriesRevision: Number(row?.directories_revision || 0),
    documentsRevision: Number(row?.documents_revision || 0),
  };
}
