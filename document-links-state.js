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

export function validateDraft(draft) {
  const errors = {};
  if (!normalizeText(draft?.directoryId)) errors.directoryId = '请选择所属目录';
  const title = normalizeText(draft?.title);
  const description = normalizeText(draft?.description);
  if (!title) errors.title = '标题为必填项';
  else if (unicodeLength(title) > 20) errors.title = '标题不能超过 20 个字符';
  if (!description) errors.description = '描述为必填项';
  else if (unicodeLength(description) > 100) errors.description = '描述不能超过 100 个字符';
  return errors;
}

export async function documentApiRequest(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...options,
    headers: options.body
      ? { 'Content-Type': 'application/json', ...(options.headers || {}) }
      : options.headers,
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401 && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('auth-required'));
  }
  if (data.code === 'PASSWORD_CHANGE_REQUIRED' && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('password-change-required'));
  }
  if (!response.ok) {
    const exception = new Error(data.message || '请求失败');
    exception.code = data.code;
    exception.fields = data.fields || {};
    throw exception;
  }
  return data;
}

function sortDirectories(items) {
  return items.slice().sort((a, b) =>
    (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)
  );
}

function sortDocuments(items) {
  return items.slice().sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id)
  );
}

function clone(value) {
  return structuredClone(value);
}

export function createDocumentLinksStore({ request = documentApiRequest } = {}) {
  let state = freshState();
  let generation = 0;
  let directoryMutationPending = false;
  const subscribers = new Set();

  function freshState() {
    return {
      status: 'idle', directories: [], documents: [], editor: null, error: '',
      revisions: { directoriesRevision: 0, documentsRevision: 0 },
    };
  }

  function notify() {
    const snapshot = getState();
    subscribers.forEach((subscriber) => subscriber(snapshot));
  }

  function setState(patch) {
    state = { ...state, ...patch };
    notify();
  }

  function recalculate(directories = state.directories, documents = state.documents) {
    return sortDirectories(directories).map((directory) => ({
      ...directory,
      documentCount: documents.filter((document) => document.directoryId === directory.id).length,
    }));
  }

  function getState() {
    return clone(state);
  }

  function subscribe(subscriber) {
    subscribers.add(subscriber);
    subscriber(getState());
    return () => subscribers.delete(subscriber);
  }

  async function load() {
    if (state.status === 'ready') return true;
    if (state.status === 'loading') return false;
    setState({ status: 'loading', error: '' });
    const operationGeneration = generation;
    try {
      const directoryResponse = await request('/api/document-directories');
      if (operationGeneration !== generation) return false;
      const documentResponse = await request('/api/document-links');
      if (operationGeneration !== generation) return false;
      const documents = sortDocuments(documentResponse.data?.documents || []);
      setState({
        status: 'ready',
        directories: recalculate(directoryResponse.data?.directories || [], documents),
        documents,
        revisions: {
          directoriesRevision: Number(directoryResponse.data?.revision || 0),
          documentsRevision: Number(documentResponse.data?.revision || 0),
        },
        error: '',
      });
      return true;
    } catch (exception) {
      if (operationGeneration !== generation) return false;
      setState({ status: 'error', error: exception.message || '加载失败' });
      return false;
    }
  }

  async function prefetch() {
    if (state.status === 'ready') return true;
    const operationGeneration = generation;
    const [directoryResult, documentResult] = await Promise.allSettled([
      request('/api/document-directories'),
      request('/api/document-links'),
    ]);
    if (operationGeneration !== generation) return false;
    if (directoryResult.status !== 'fulfilled' || documentResult.status !== 'fulfilled') {
      const failure = directoryResult.status === 'rejected' ? directoryResult.reason : documentResult.reason;
      setState({ error: failure?.message || '加载失败' });
      return false;
    }
    const directoryResponse = directoryResult.value;
    const documentResponse = documentResult.value;
    const documents = sortDocuments(documentResponse.data?.documents || []);
    setState({
      status: 'ready',
      directories: recalculate(directoryResponse.data?.directories || [], documents),
      documents,
      revisions: {
        directoriesRevision: Number(directoryResponse.data?.revision || 0),
        documentsRevision: Number(documentResponse.data?.revision || 0),
      },
      error: '',
    });
    return true;
  }

  function getRevisions() {
    return { ...state.revisions };
  }

  async function sync(remoteRevisions = {}) {
    if (state.status !== 'ready') return prefetch();
    const operationGeneration = generation;
    const tasks = [];
    if (Number(remoteRevisions.directoriesRevision || 0) > state.revisions.directoriesRevision) {
      tasks.push(['directories', request('/api/document-directories')]);
    }
    if (Number(remoteRevisions.documentsRevision || 0) > state.revisions.documentsRevision) {
      tasks.push(['documents', request('/api/document-links')]);
    }
    if (!tasks.length) return true;
    const results = await Promise.allSettled(tasks.map(([, promise]) => promise));
    if (operationGeneration !== generation) return false;
    let directories = state.directories;
    let documents = state.documents;
    const revisions = { ...state.revisions };
    results.forEach((result, index) => {
      if (result.status !== 'fulfilled') return;
      const [domain] = tasks[index];
      if (domain === 'directories') {
        directories = result.value.data?.directories || [];
        revisions.directoriesRevision = Number(result.value.data?.revision || revisions.directoriesRevision);
      } else {
        documents = sortDocuments(result.value.data?.documents || []);
        revisions.documentsRevision = Number(result.value.data?.revision || revisions.documentsRevision);
      }
    });
    setState({ directories: recalculate(directories, documents), documents, revisions });
    return results.every((result) => result.status === 'fulfilled');
  }

  function reset() {
    generation += 1;
    state = freshState();
    notify();
  }

  function hydrateForTest(data) {
    const documents = sortDocuments(clone(data.documents || []));
    state = {
      ...freshState(), status: 'ready', documents,
      directories: recalculate(clone(data.directories || []), documents),
    };
    notify();
  }

  function beginAdd(directoryId) {
    if (state.editor) return false;
    setState({ editor: {
      mode: 'add', documentId: null,
      draft: { directoryId, title: '', description: '' }, errors: {}, error: '', saving: false,
    } });
    return true;
  }

  function beginEdit(documentId) {
    if (state.editor) return false;
    const document = state.documents.find((item) => item.id === documentId);
    if (!document) return false;
    setState({ editor: {
      mode: 'edit', documentId,
      draft: { directoryId: document.directoryId, title: document.title, description: document.description },
      baseUpdatedAt: document.updatedAt,
      errors: {}, error: '', saving: false, conflict: null,
    } });
    return true;
  }

  function cancelEdit() {
    if (state.editor?.saving) return false;
    setState({ editor: null });
    return true;
  }

  function updateDraft(patch) {
    if (!state.editor || state.editor.saving) return false;
    setState({ editor: {
      ...state.editor,
      draft: { ...state.editor.draft, ...patch },
      errors: {}, error: '',
    } });
    return true;
  }

  async function saveDraft({ force = false } = {}) {
    if (!state.editor || state.editor.saving) return false;
    const errors = validateDraft(state.editor.draft);
    if (Object.keys(errors).length) {
      setState({ editor: { ...state.editor, errors } });
      return false;
    }
    const editor = state.editor;
    const operationGeneration = generation;
    setState({ editor: { ...editor, saving: true, errors: {}, error: '' } });
    const body = {
      ...(editor.mode === 'edit' ? { id: editor.documentId } : {}),
      ...(editor.mode === 'edit' ? { baseUpdatedAt: editor.baseUpdatedAt, force } : {}),
      directoryId: normalizeText(editor.draft.directoryId),
      title: normalizeText(editor.draft.title),
      description: normalizeText(editor.draft.description),
    };
    try {
      const data = await request('/api/document-links', {
        method: editor.mode === 'add' ? 'POST' : 'PUT',
        body: JSON.stringify(body),
      });
      if (operationGeneration !== generation) return false;
      const documents = editor.mode === 'add'
        ? [data.document, ...state.documents]
        : state.documents.map((item) => item.id === editor.documentId ? data.document : item);
      const sorted = sortDocuments(documents);
      setState({ documents: sorted, directories: recalculate(state.directories, sorted), editor: null });
      return true;
    } catch (exception) {
      if (operationGeneration !== generation) return false;
      if (exception.code === 'EDIT_CONFLICT') {
        setState({ editor: {
          ...editor, saving: false, conflict: { current: exception.current || null },
          error: exception.message || '该内容已在其他设备更新',
        } });
        return false;
      }
      setState({ editor: {
        ...editor, saving: false, errors: exception.fields || {}, error: exception.message || '保存失败',
      } });
      return false;
    }
  }

  async function resolveConflict(choice) {
    if (!state.editor?.conflict) return false;
    if (choice === 'overwrite') return saveDraft({ force: true });
    if (choice !== 'remote') return false;
    const id = state.editor.documentId;
    const current = state.editor.conflict.current;
    const documents = current
      ? sortDocuments(state.documents.map((item) => item.id === id ? current : item))
      : state.documents.filter((item) => item.id !== id);
    setState({
      documents,
      directories: recalculate(state.directories, documents),
      editor: null,
    });
    return true;
  }

  async function deleteDocument(id) {
    const operationGeneration = generation;
    await request(`/api/document-links?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (operationGeneration !== generation) return false;
    const documents = state.documents.filter((item) => item.id !== id);
    setState({ documents, directories: recalculate(state.directories, documents) });
    return true;
  }

  async function createDirectory(name) {
    if (directoryMutationPending) throw new Error('目录操作正在进行，请稍候');
    const validationError = validateDirectoryName(name);
    if (validationError) throw new Error(validationError);
    const key = directoryNameKey(name);
    if (state.directories.some((item) => directoryNameKey(item.name) === key)) throw new Error('目录名称已存在');
    const operationGeneration = generation;
    directoryMutationPending = true;
    try {
      const data = await request('/api/document-directories', {
        method: 'POST', body: JSON.stringify({ name: normalizeText(name) }),
      });
      if (operationGeneration !== generation) return null;
      setState({ directories: recalculate([...state.directories, data.directory], state.documents) });
      return data.directory;
    } finally {
      directoryMutationPending = false;
    }
  }

  async function renameDirectory(id, name) {
    if (directoryMutationPending) throw new Error('目录操作正在进行，请稍候');
    const validationError = validateDirectoryName(name);
    if (validationError) throw new Error(validationError);
    const key = directoryNameKey(name);
    if (state.directories.some((item) => item.id !== id && directoryNameKey(item.name) === key)) throw new Error('目录名称已存在');
    const operationGeneration = generation;
    directoryMutationPending = true;
    try {
      const data = await request('/api/document-directories', {
        method: 'PUT', body: JSON.stringify({ id, name: normalizeText(name) }),
      });
      if (operationGeneration !== generation) return null;
      setState({ directories: recalculate(state.directories.map((item) =>
        item.id === id ? { ...item, ...data.directory, createdAt: item.createdAt } : item
      ), state.documents) });
      return data.directory;
    } finally {
      directoryMutationPending = false;
    }
  }

  async function deleteDirectory(id) {
    if (directoryMutationPending) throw new Error('目录操作正在进行，请稍候');
    const operationGeneration = generation;
    directoryMutationPending = true;
    try {
      await request(`/api/document-directories?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (operationGeneration !== generation) return false;
      setState({ directories: state.directories.filter((item) => item.id !== id) });
      return true;
    } finally {
      directoryMutationPending = false;
    }
  }

  async function moveDirectory(id, direction) {
    if (directoryMutationPending) throw new Error('目录操作正在进行，请稍候');
    const operationGeneration = generation;
    directoryMutationPending = true;
    try {
      const data = await request('/api/document-directories', {
        method: 'PUT', body: JSON.stringify({ id, direction }),
      });
      if (operationGeneration !== generation) return false;
      if (!Array.isArray(data.data?.directories)) throw new Error('目录排序返回数据无效');
      setState({ directories: recalculate(data.data.directories, state.documents) });
      return true;
    } finally {
      directoryMutationPending = false;
    }
  }

  return {
    getState, getRevisions, subscribe, load, prefetch, sync, reset, hydrateForTest,
    beginAdd, beginEdit, cancelEdit, updateDraft, saveDraft, resolveConflict,
    deleteDocument, createDirectory, renameDirectory, deleteDirectory, moveDirectory,
  };
}
