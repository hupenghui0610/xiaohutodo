import { createDocumentLinksStore, documentApiRequest, unicodeLength } from './document-links-state.js';

function element(root, tagName, className = '', text = '') {
  const node = root.createElement(tagName);
  node.className = className;
  node.textContent = text;
  return node;
}

export function createDocumentLinksUi({ root = document, store = createDocumentLinksStore({ request: documentApiRequest }) } = {}) {
  const content = root.getElementById('documentsContent');
  const manageButton = root.getElementById('directoryManageBtn');
  const directoryModal = root.getElementById('directoryModal');
  const directoryBody = root.getElementById('directoryModalBody');
  const directoryForm = root.getElementById('directoryCreateForm');
  const directoryInput = root.getElementById('directoryNameInput');
  const directoryError = root.getElementById('directoryModalError');
  const directoryClose = root.getElementById('directoryModalCloseBtn');
  const confirmModal = root.getElementById('confirmModal');
  const confirmTitle = root.getElementById('confirmTitle');
  const confirmMessage = root.getElementById('confirmMessage');
  const confirmAccept = root.getElementById('confirmAcceptBtn');
  const confirmCancel = root.getElementById('confirmCancelBtn');
  let confirmState = null;
  let renamingId = null;
  let renameValue = '';

  function button(className, text, action) {
    const node = element(root, 'button', className, text);
    node.type = 'button';
    node.dataset.action = action;
    return node;
  }

  function closeConfirmation() {
    confirmModal.classList.add('hidden');
    const trigger = confirmState?.trigger;
    confirmState = null;
    trigger?.focus();
  }

  function openConfirmation({ title, message, trigger, action }) {
    confirmTitle.textContent = title;
    confirmMessage.textContent = message;
    confirmState = { trigger, action };
    confirmModal.classList.remove('hidden');
    confirmCancel.focus();
  }

  confirmCancel.addEventListener('click', closeConfirmation);
  confirmAccept.addEventListener('click', async () => {
    const pending = confirmState;
    if (!pending) return;
    confirmAccept.disabled = true;
    try {
      await pending.action();
      closeConfirmation();
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

  function renderEditor(editor, directories) {
    const wrapper = element(root, 'div', 'document-editor');
    const fields = element(root, 'div', 'document-editor__fields');

    const titleGroup = element(root, 'label', 'document-field');
    titleGroup.append(element(root, 'span', 'document-field__label', '标题'));
    const titleInput = element(root, 'input', 'input');
    titleInput.dataset.field = 'title';
    titleInput.value = editor.draft.title;
    titleInput.maxLength = 20;
    titleInput.disabled = editor.saving;
    titleInput.addEventListener('input', (event) => store.updateDraft({ title: event.target.value }));
    titleGroup.append(titleInput, element(root, 'div', 'character-count', `${unicodeLength(editor.draft.title)}/20`), fieldError(editor.errors.title));

    const descriptionGroup = element(root, 'label', 'document-field');
    descriptionGroup.append(element(root, 'span', 'document-field__label', '描述'));
    const descriptionInput = element(root, 'textarea', 'input document-description-input');
    descriptionInput.dataset.field = 'description';
    descriptionInput.value = editor.draft.description;
    descriptionInput.maxLength = 100;
    descriptionInput.disabled = editor.saving;
    descriptionInput.addEventListener('input', (event) => store.updateDraft({ description: event.target.value }));
    descriptionGroup.append(descriptionInput, element(root, 'div', 'character-count', `${unicodeLength(editor.draft.description)}/100`), fieldError(editor.errors.description));

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
    directoryGroup.append(select, fieldError(editor.errors.directoryId));

    fields.append(titleGroup, descriptionGroup, directoryGroup);
    const error = element(root, 'div', 'field-error document-editor__error', editor.error || '');
    const actions = element(root, 'div', 'document-row__actions');
    const cancel = button('btn btn-ghost', '取消', 'cancel-editor');
    cancel.disabled = editor.saving;
    cancel.addEventListener('click', () => store.cancelEdit());
    const save = button('btn btn-primary', editor.saving ? '保存中…' : '保存', 'save-editor');
    save.disabled = editor.saving;
    save.addEventListener('click', () => store.saveDraft());
    actions.append(cancel, save);
    wrapper.append(fields, error, actions);
    return wrapper;
  }

  function renderDocumentRow(document, state) {
    const row = element(root, 'div', 'document-row');
    const title = button('document-row__title', document.title, 'edit-document');
    title.disabled = Boolean(state.editor);
    title.addEventListener('click', () => store.beginEdit(document.id));
    const description = element(root, 'div', 'document-row__description', document.description);
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
    const header = element(root, 'div', 'document-directory__header');
    const heading = element(root, 'div', 'panel-title', directory.name);
    const add = button('btn btn-primary', '添加', 'add-document');
    add.disabled = Boolean(state.editor);
    add.addEventListener('click', () => store.beginAdd(directory.id));
    header.append(heading, add);
    const body = element(root, 'div', 'document-directory__body');
    const editorBelongsHere = state.editor && state.editor.draft.directoryId === directory.id;
    if (editorBelongsHere) body.append(renderEditor(state.editor, state.directories));
    const documents = state.documents.filter((item) => item.directoryId === directory.id);
    documents.forEach((document) => {
      if (state.editor?.mode === 'edit' && state.editor.documentId === document.id) {
        if (!editorBelongsHere) body.append(renderEditor(state.editor, state.directories));
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
    state.directories.forEach((directory) => {
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
        rename.addEventListener('click', () => {
          renamingId = directory.id;
          renameValue = directory.name;
          renderDirectoryManager(store.getState());
        });
        const remove = button('btn btn-danger', '删除', 'delete-directory');
        remove.disabled = directory.documentCount > 0;
        remove.setAttribute('title', remove.disabled ? '请先删除或移动目录内的文档链接' : '删除目录');
        remove.addEventListener('click', () => openConfirmation({
          title: '删除目录', message: `确认删除空目录“${directory.name}”吗？`, trigger: remove,
          action: () => store.deleteDirectory(directory.id),
        }));
        row.append(info, rename, remove);
      }
      directoryBody.append(row);
    });
    if (!state.directories.length) directoryBody.append(element(root, 'div', 'document-empty', '暂无目录'));
  }

  function render(state) {
    if (!renderStatus(state)) {
      content.replaceChildren(...state.directories.map((directory) => renderDirectory(directory, state)));
    }
    if (!directoryModal.classList.contains('hidden')) renderDirectoryManager(state);
  }

  manageButton.addEventListener('click', () => {
    directoryError.textContent = '';
    directoryInput.value = '';
    renamingId = null;
    directoryModal.classList.remove('hidden');
    renderDirectoryManager(store.getState());
    directoryInput.focus();
  });
  function closeDirectoryModal() {
    directoryModal.classList.add('hidden');
    renamingId = null;
    directoryInput.value = '';
    manageButton.focus();
  }
  directoryClose.addEventListener('click', closeDirectoryModal);
  directoryForm.addEventListener('submit', async (event) => {
    event.preventDefault();
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
