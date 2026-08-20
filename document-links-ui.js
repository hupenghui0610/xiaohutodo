import { createDocumentLinksStore, documentApiRequest, unicodeLength } from './document-links-state.js';

function element(root, tagName, className = '', text = '') {
  const node = root.createElement(tagName);
  node.className = className;
  node.textContent = text;
  return node;
}

const DESCRIPTION_URL_CANDIDATE = /https?:\/\/[^\s，。；！？、]+/giu;
const TERMINAL_SENTENCE_PUNCTUATION = /[,.!?;:]+$/u;
const BRACKET_PAIRS = { ')': '(', ']': '[', '}': '{' };

function splitTerminalCharacters(candidate) {
  let value = candidate;
  let trailing = '';
  const punctuation = value.match(TERMINAL_SENTENCE_PUNCTUATION)?.[0] || '';
  if (punctuation) {
    value = value.slice(0, -punctuation.length);
    trailing = punctuation + trailing;
  }

  while (BRACKET_PAIRS[value.at(-1)]) {
    const closing = value.at(-1);
    const opening = BRACKET_PAIRS[closing];
    const openingCount = [...value].filter((character) => character === opening).length;
    const closingCount = [...value].filter((character) => character === closing).length;
    if (closingCount <= openingCount) break;
    value = value.slice(0, -1);
    trailing = closing + trailing;
  }
  return { value, trailing };
}

function isValidHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function appendSegment(segments, type, value) {
  if (!value) return;
  const previous = segments.at(-1);
  if (type === 'text' && previous?.type === 'text') {
    previous.value += value;
    return;
  }
  segments.push({ type, value });
}

export function parseDescriptionSegments(text = '') {
  const source = String(text);
  const segments = [];
  let cursor = 0;

  for (const match of source.matchAll(DESCRIPTION_URL_CANDIDATE)) {
    if (match.index > cursor) appendSegment(segments, 'text', source.slice(cursor, match.index));
    const { value, trailing } = splitTerminalCharacters(match[0]);
    if (value && isValidHttpUrl(value)) {
      appendSegment(segments, 'link', value);
      appendSegment(segments, 'text', trailing);
    } else {
      appendSegment(segments, 'text', match[0]);
    }
    cursor = match.index + match[0].length;
  }

  if (cursor < source.length) appendSegment(segments, 'text', source.slice(cursor));
  return segments.length ? segments : [{ type: 'text', value: source }];
}

export function createDocumentLinksUi({ root = document, store = createDocumentLinksStore({ request: documentApiRequest }) } = {}) {
  const content = root.getElementById('documentsContent');
  const mainApp = root.getElementById('mainApp');
  const manageButton = root.getElementById('directoryManageBtn');
  const directoryModal = root.getElementById('directoryModal');
  const directoryBody = root.getElementById('directoryModalBody');
  const directoryForm = root.getElementById('directoryCreateForm');
  const directoryInput = root.getElementById('directoryNameInput');
  const directoryCreateButton = root.getElementById('directoryCreateBtn');
  const directoryError = root.getElementById('directoryModalError');
  const directoryClose = root.getElementById('directoryModalCloseBtn');
  const confirmModal = root.getElementById('confirmModal');
  const confirmTitle = root.getElementById('confirmTitle');
  const confirmMessage = root.getElementById('confirmMessage');
  const confirmError = root.getElementById('confirmError');
  const confirmAccept = root.getElementById('confirmAcceptBtn');
  const confirmCancel = root.getElementById('confirmCancelBtn');
  let confirmState = null;
  let renamingId = null;
  let renameValue = '';
  let movingDirectoryId = null;

  function button(className, text, action) {
    const node = element(root, 'button', className, text);
    node.type = 'button';
    node.dataset.action = action;
    return node;
  }

  function closeConfirmation(focusTarget = confirmState?.trigger) {
    confirmModal.classList.add('hidden');
    directoryModal.inert = false;
    confirmState = null;
    confirmError.textContent = '';
    focusTarget?.focus();
  }

  function openConfirmation({ title, message, trigger, action }) {
    confirmTitle.textContent = title;
    confirmMessage.textContent = message;
    confirmError.textContent = '';
    confirmState = { trigger, action };
    directoryModal.inert = !directoryModal.classList.contains('hidden');
    confirmModal.classList.remove('hidden');
    confirmCancel.focus();
  }

  confirmCancel.addEventListener('click', () => closeConfirmation());
  confirmAccept.addEventListener('click', async () => {
    const pending = confirmState;
    if (!pending) return;
    confirmAccept.disabled = true;
    try {
      await pending.action();
      const directoryOpen = !directoryModal.classList.contains('hidden');
      closeConfirmation(directoryOpen ? directoryInput : manageButton);
    } catch (exception) {
      confirmError.textContent = exception.message || '删除失败';
    } finally {
      confirmAccept.disabled = false;
    }
  });

  function renderStatus(state) {
    if (state.status === 'loading') {
      content.replaceChildren(element(root, 'div', 'document-empty', '正在加载…'));
      return true;
    }
    if (state.status === 'error') {
      const box = element(root, 'div', 'document-empty');
      box.append(element(root, 'div', '', state.error || '加载失败'));
      const retry = button('btn btn-primary', '重试', 'retry');
      retry.addEventListener('click', () => store.load());
      box.append(retry);
      content.replaceChildren(box);
      return true;
    }
    if (state.status === 'ready' && !state.directories.length) {
      content.replaceChildren(element(root, 'div', 'document-empty', '暂无目录，请通过“目录管理”创建目录。'));
      return true;
    }
    return false;
  }

  function fieldError(message) {
    return element(root, 'div', 'field-error', message || '');
  }

  function renderDescription(text) {
    const container = element(root, 'div', 'document-row__description');
    for (const segment of parseDescriptionSegments(text)) {
      if (segment.type === 'text') {
        container.append(element(root, 'span', '', segment.value));
        continue;
      }
      const link = element(root, 'a', 'document-row__description-link', segment.value);
      link.setAttribute('href', segment.value);
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
      link.setAttribute('title', segment.value);
      container.append(link);
    }
    return container;
  }

  function renderEditor(editor, directories) {
    const wrapper = element(root, 'div', 'document-editor');
    const fields = element(root, 'div', 'document-editor__fields');
    const topFields = element(root, 'div', 'document-editor__top-fields');

    const titleGroup = element(root, 'label', 'document-field');
    titleGroup.append(element(root, 'span', 'document-field__label', '标题'));
    const titleInput = element(root, 'input', 'input');
    titleInput.dataset.field = 'title';
    titleInput.value = editor.draft.title;
    titleInput.maxLength = 20;
    titleInput.disabled = editor.saving;
    titleInput.addEventListener('input', (event) => store.updateDraft({ title: event.target.value }));
    const titleCount = element(root, 'div', 'character-count', `${unicodeLength(editor.draft.title)}/20`);
    titleCount.dataset.role = 'title-count';
    const titleError = fieldError(editor.errors.title);
    titleError.dataset.errorFor = 'title';
    titleGroup.append(titleInput, titleCount, titleError);

    const descriptionGroup = element(root, 'label', 'document-field document-field--description');
    descriptionGroup.append(element(root, 'span', 'document-field__label', '描述'));
    const descriptionInput = element(root, 'textarea', 'input document-description-input');
    descriptionInput.dataset.field = 'description';
    descriptionInput.value = editor.draft.description;
    descriptionInput.maxLength = 100;
    descriptionInput.disabled = editor.saving;
    descriptionInput.addEventListener('input', (event) => store.updateDraft({ description: event.target.value }));
    const descriptionCount = element(root, 'div', 'character-count', `${unicodeLength(editor.draft.description)}/100`);
    descriptionCount.dataset.role = 'description-count';
    const descriptionError = fieldError(editor.errors.description);
    descriptionError.dataset.errorFor = 'description';
    descriptionGroup.append(descriptionInput, descriptionCount, descriptionError);

    const directoryGroup = element(root, 'label', 'document-field');
    directoryGroup.append(element(root, 'span', 'document-field__label', '所属目录'));
    const select = element(root, 'select', 'input');
    select.dataset.field = 'directoryId';
    select.value = editor.draft.directoryId;
    select.disabled = editor.saving;
    directories.forEach((directory) => {
      const option = element(root, 'option', '', directory.name);
      option.value = directory.id;
      option.selected = directory.id === editor.draft.directoryId;
      select.append(option);
    });
    select.addEventListener('change', (event) => store.updateDraft({ directoryId: event.target.value }));
    const directoryErrorNode = fieldError(editor.errors.directoryId);
    directoryErrorNode.dataset.errorFor = 'directoryId';
    directoryGroup.append(select, directoryErrorNode);

    topFields.append(titleGroup, directoryGroup);
    fields.append(topFields, descriptionGroup);
    const error = element(root, 'div', 'field-error document-editor__error', editor.error || '');
    error.dataset.role = 'editor-error';
    const actions = element(root, 'div', 'document-row__actions');
    if (editor.conflict) {
      const remote = button('btn btn-ghost', '使用远端内容', 'use-remote');
      remote.addEventListener('click', () => store.resolveConflict('remote'));
      const overwrite = button('btn btn-danger', '仍然覆盖', 'overwrite-remote');
      overwrite.addEventListener('click', () => store.resolveConflict('overwrite'));
      actions.append(remote, overwrite);
    }
    const cancel = button('btn btn-ghost', '取消', 'cancel-editor');
    cancel.disabled = editor.saving;
    cancel.addEventListener('click', () => store.cancelEdit());
    const save = button('btn btn-primary', editor.saving ? '保存中…' : '保存', 'save-editor');
    save.disabled = editor.saving;
    save.addEventListener('click', () => store.saveDraft());
    actions.append(cancel, save);
    const footer = element(root, 'div', 'document-editor__footer');
    footer.append(error, actions);
    wrapper.append(fields, footer);
    return wrapper;
  }

  function renderDocumentRow(document, state) {
    const row = element(root, 'div', 'document-row');
    row.dataset.documentId = document.id;
    const title = button('document-row__title', document.title, 'edit-document');
    title.disabled = Boolean(state.editor);
    if (title.disabled) title.setAttribute('title', '请先保存或取消当前编辑');
    title.addEventListener('click', () => store.beginEdit(document.id));
    const description = renderDescription(document.description);
    const actions = element(root, 'div', 'document-row__actions');
    const remove = button('btn btn-danger', '删除', 'delete-document');
    remove.addEventListener('click', () => openConfirmation({
      title: '删除文档链接',
      message: `确认删除“${document.title}”吗？此操作无法撤销。`,
      trigger: remove,
      action: () => store.deleteDocument(document.id),
    }));
    actions.append(remove);
    row.append(title, description, actions);
    return row;
  }

  function renderDirectory(directory, state) {
    const card = element(root, 'section', 'panel document-directory');
    card.dataset.directoryId = directory.id;
    const header = element(root, 'div', 'document-directory__header');
    const heading = element(root, 'div', 'panel-title', directory.name);
    const add = button('btn btn-primary', '添加', 'add-document');
    add.disabled = Boolean(state.editor);
    if (add.disabled) add.setAttribute('title', '请先保存或取消当前编辑');
    add.addEventListener('click', () => store.beginAdd(directory.id));
    header.append(heading, add);
    const body = element(root, 'div', 'document-directory__body');
    const editorBelongsHere = state.editor && state.editor.draft.directoryId === directory.id;
    if (editorBelongsHere) body.append(renderEditor(state.editor, state.directories));
    const documents = state.documents.filter((item) => item.directoryId === directory.id);
    documents.forEach((document) => {
      if (state.editor?.mode === 'edit' && state.editor.documentId === document.id) {
        return;
      } else {
        body.append(renderDocumentRow(document, state));
      }
    });
    if (!documents.length && !editorBelongsHere) body.append(element(root, 'div', 'document-empty', '暂无文档链接'));
    card.append(header, body);
    return card;
  }

  function renderDirectoryManager(state) {
    directoryBody.replaceChildren();
    directoryInput.disabled = movingDirectoryId !== null;
    directoryCreateButton.disabled = movingDirectoryId !== null;
    state.directories.forEach((directory, index) => {
      const row = element(root, 'div', 'directory-manager-row');
      if (renamingId === directory.id) {
        const input = element(root, 'input', 'input');
        input.value = renameValue;
        input.maxLength = 20;
        input.addEventListener('input', (event) => { renameValue = event.target.value; });
        const save = button('btn btn-primary', '保存', 'save-directory-name');
        save.addEventListener('click', async () => {
          directoryError.textContent = '';
          try {
            await store.renameDirectory(directory.id, renameValue);
            renamingId = null;
            renderDirectoryManager(store.getState());
          } catch (exception) {
            directoryError.textContent = exception.message;
          }
        });
        const cancel = button('btn btn-ghost', '取消', 'cancel-directory-name');
        cancel.addEventListener('click', () => { renamingId = null; renderDirectoryManager(store.getState()); });
        row.append(input, save, cancel);
      } else {
        const info = element(root, 'div', 'directory-manager-row__info');
        info.append(element(root, 'strong', '', directory.name), element(root, 'span', '', `${directory.documentCount} 条文档`));
        const rename = button('btn btn-ghost', '改名', 'rename-directory');
        rename.disabled = movingDirectoryId !== null;
        rename.addEventListener('click', () => {
          renamingId = directory.id;
          renameValue = directory.name;
          renderDirectoryManager(store.getState());
        });
        const remove = button('btn btn-danger', '删除', 'delete-directory');
        remove.disabled = directory.documentCount > 0 || movingDirectoryId !== null;
        remove.setAttribute('title', remove.disabled ? '请先删除或移动目录内的文档链接' : '删除目录');
        remove.addEventListener('click', () => openConfirmation({
          title: '删除目录', message: `确认删除空目录“${directory.name}”吗？`, trigger: remove,
          action: () => store.deleteDirectory(directory.id),
        }));
        const moveUp = button('btn btn-ghost', '上移', 'move-directory-up');
        moveUp.disabled = index === 0 || movingDirectoryId !== null || renamingId !== null;
        moveUp.setAttribute('aria-label', `上移目录 ${directory.name}`);
        moveUp.setAttribute('title', index === 0 ? '已经是第一个目录' : '向上移动一位');
        const moveDown = button('btn btn-ghost', '下移', 'move-directory-down');
        moveDown.disabled = index === state.directories.length - 1 || movingDirectoryId !== null || renamingId !== null;
        moveDown.setAttribute('aria-label', `下移目录 ${directory.name}`);
        moveDown.setAttribute('title', index === state.directories.length - 1 ? '已经是最后一个目录' : '向下移动一位');
        const move = async (direction) => {
          directoryError.textContent = '';
          movingDirectoryId = directory.id;
          renderDirectoryManager(store.getState());
          try {
            await store.moveDirectory(directory.id, direction);
          } catch (exception) {
            directoryError.textContent = exception.message || '目录移动失败';
          } finally {
            movingDirectoryId = null;
            renderDirectoryManager(store.getState());
          }
        };
        moveUp.addEventListener('click', () => move('up'));
        moveDown.addEventListener('click', () => move('down'));
        row.append(info, moveUp, moveDown, rename, remove);
      }
      directoryBody.append(row);
    });
    if (!state.directories.length) directoryBody.append(element(root, 'div', 'document-empty', '暂无目录'));
  }

  function findDescendant(node, predicate) {
    if (predicate(node)) return node;
    for (const child of node.children || []) {
      const match = findDescendant(child, predicate);
      if (match) return match;
    }
    return null;
  }

  function patchEditor(editor) {
    const field = (name) => findDescendant(content, (node) => node.dataset?.field === name);
    const role = (name) => findDescendant(content, (node) => node.dataset?.role === name);
    const errorFor = (name) => findDescendant(content, (node) => node.dataset?.errorFor === name);
    const title = field('title');
    const description = field('description');
    const directory = field('directoryId');
    if (!title || !description || !directory) return false;
    title.value = editor.draft.title;
    description.value = editor.draft.description;
    directory.value = editor.draft.directoryId;
    title.disabled = description.disabled = directory.disabled = editor.saving;
    role('title-count').textContent = `${unicodeLength(editor.draft.title)}/20`;
    role('description-count').textContent = `${unicodeLength(editor.draft.description)}/100`;
    errorFor('title').textContent = editor.errors.title || '';
    errorFor('description').textContent = editor.errors.description || '';
    errorFor('directoryId').textContent = editor.errors.directoryId || '';
    role('editor-error').textContent = editor.error || '';
    const save = findDescendant(content, (node) => node.dataset?.action === 'save-editor');
    const cancel = findDescendant(content, (node) => node.dataset?.action === 'cancel-editor');
    save.disabled = cancel.disabled = editor.saving;
    save.textContent = editor.saving ? '保存中…' : '保存';
    return true;
  }

  let previousState = null;

  function hasSameEditorPlacement(left, right) {
    if (!left && !right) return true;
    return Boolean(left && right
      && left.mode === right.mode
      && left.documentId === right.documentId
      && left.draft.directoryId === right.draft.directoryId
      && Boolean(left.conflict) === Boolean(right.conflict));
  }

  function reconcileDocumentRows(body, directory, state) {
    const previousDocuments = new Map((previousState?.documents || []).map((item) => [item.id, item]));
    const existingRows = new Map(Array.from(body.children || [])
      .filter((node) => node.dataset?.documentId)
      .map((node) => [node.dataset.documentId, node]));
    const nextDocuments = state.documents.filter((item) =>
      item.directoryId === directory.id
      && !(state.editor?.mode === 'edit' && state.editor.documentId === item.id)
    );
    const nextIds = new Set(nextDocuments.map((item) => item.id));

    existingRows.forEach((row, id) => {
      if (!nextIds.has(id)) row.remove();
    });
    nextDocuments.forEach((document) => {
      let row = existingRows.get(document.id);
      const previous = previousDocuments.get(document.id);
      if (!row || JSON.stringify(previous) !== JSON.stringify(document)) {
        const replacement = renderDocumentRow(document, state);
        if (row) row.replaceWith(replacement);
        row = replacement;
      }
      body.append(row);
    });

    const empty = Array.from(body.children || []).find((node) =>
      node.classList?.contains('document-empty')
    );
    const editorBelongsHere = state.editor?.draft.directoryId === directory.id;
    if (!nextDocuments.length && !editorBelongsHere) {
      if (!empty) body.append(element(root, 'div', 'document-empty', '暂无文档链接'));
    } else {
      empty?.remove();
    }
  }

  function reconcileReadyState(state) {
    const existingCards = new Map(Array.from(content.children || [])
      .filter((node) => node.dataset?.directoryId)
      .map((node) => [node.dataset.directoryId, node]));
    const nextIds = new Set(state.directories.map((item) => item.id));
    existingCards.forEach((card, id) => {
      if (!nextIds.has(id)) card.remove();
    });

    state.directories.forEach((directory) => {
      let card = existingCards.get(directory.id);
      if (!card) {
        card = renderDirectory(directory, state);
      } else {
        const header = card.children[0];
        const heading = header?.children[0];
        const add = header?.children[1];
        if (heading) heading.textContent = directory.name;
        if (add) {
          add.disabled = Boolean(state.editor);
          if (add.disabled) add.setAttribute('title', '请先保存或取消当前编辑');
        }
        reconcileDocumentRows(card.children[1], directory, state);
      }
      content.append(card);
    });
  }

  function render(state) {
    const sameEditorPlacement = previousState?.editor && state.editor
      && previousState.editor.mode === state.editor.mode
      && previousState.editor.documentId === state.editor.documentId
      && previousState.editor.draft.directoryId === state.editor.draft.directoryId
      && Boolean(previousState.editor.conflict) === Boolean(state.editor.conflict);
    const sameCollections = previousState
      && JSON.stringify(previousState.directories) === JSON.stringify(state.directories)
      && JSON.stringify(previousState.documents) === JSON.stringify(state.documents);
    if (sameEditorPlacement && sameCollections && patchEditor(state.editor)) {
      previousState = state;
      return;
    }
    if (previousState?.status === 'ready' && state.status === 'ready'
      && hasSameEditorPlacement(previousState.editor, state.editor)) {
      if (state.editor) patchEditor(state.editor);
      reconcileReadyState(state);
      if (!directoryModal.classList.contains('hidden')) renderDirectoryManager(state);
      previousState = state;
      return;
    }
    if (!renderStatus(state)) {
      content.replaceChildren(...state.directories.map((directory) => renderDirectory(directory, state)));
    }
    if (!directoryModal.classList.contains('hidden')) renderDirectoryManager(state);
    previousState = state;
  }

  manageButton.addEventListener('click', () => {
    directoryError.textContent = '';
    directoryInput.value = '';
    renamingId = null;
    directoryModal.classList.remove('hidden');
    mainApp.inert = true;
    renderDirectoryManager(store.getState());
    directoryInput.focus();
  });
  function closeDirectoryModal() {
    directoryModal.classList.add('hidden');
    mainApp.inert = false;
    renamingId = null;
    directoryInput.value = '';
    manageButton.focus();
  }
  directoryClose.addEventListener('click', closeDirectoryModal);
  directoryForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (movingDirectoryId !== null) return;
    directoryError.textContent = '';
    try {
      await store.createDirectory(directoryInput.value);
      directoryInput.value = '';
    } catch (exception) {
      directoryError.textContent = exception.message;
    }
  });

  if (root.addEventListener) {
    root.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (!confirmModal.classList.contains('hidden')) closeConfirmation();
      else if (!directoryModal.classList.contains('hidden')) closeDirectoryModal();
    });
  }

  store.subscribe(render);
  return { load: () => store.load(), reset: () => {
    directoryModal.classList.add('hidden');
    confirmModal.classList.add('hidden');
    directoryModal.inert = false;
    mainApp.inert = false;
    confirmError.textContent = '';
    store.reset();
  } };
}

export function initDocumentLinks(root = document) {
  return createDocumentLinksUi({ root });
}

if (typeof document !== 'undefined') {
  const ui = initDocumentLinks(document);
  let userId = null;
  window.__documentLinksReady = (user) => {
    if (userId && userId !== user?.id) ui.reset();
    userId = user?.id || null;
  };
  window.__documentLinksInit = () => ui.load();
  window.__documentLinksReset = () => { userId = null; ui.reset(); };
}
