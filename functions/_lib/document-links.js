export const INITIAL_DIRECTORY_NAMES = Object.freeze(['赠品管理', '产品文档', '销售政策']);

export function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function unicodeLength(value) {
  return [...String(value ?? '')].length;
}

export function directoryNameKey(value) {
  return normalizeText(value).toLocaleLowerCase('zh-CN');
}

export function validateDirectoryName(value) {
  const name = normalizeText(value);
  if (!name) return '目录名称为必填项';
  if (unicodeLength(name) > 20) return '目录名称不能超过 20 个字符';
  return '';
}

export function validateDocumentFields(fields) {
  const errors = {};
  const title = normalizeText(fields?.title);
  const description = normalizeText(fields?.description);
  if (!normalizeText(fields?.directoryId)) errors.directoryId = '请选择所属目录';
  if (!title) errors.title = '标题为必填项';
  else if (unicodeLength(title) > 20) errors.title = '标题不能超过 20 个字符';
  if (!description) errors.description = '描述为必填项';
  else if (unicodeLength(description) > 100) errors.description = '描述不能超过 100 个字符';
  return errors;
}

export function mapDirectory(row) {
  return {
    id: row.id,
    name: row.name,
    documentCount: Number(row.document_count ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapDocument(row) {
  return {
    id: row.id,
    directoryId: row.directory_id,
    title: row.title,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
