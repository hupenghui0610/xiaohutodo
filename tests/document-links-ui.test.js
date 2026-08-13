import assert from 'node:assert/strict';
import test from 'node:test';

import { createDocumentLinksUi } from '../document-links-ui.js';

class FakeClassList {
  constructor(owner) { this.owner = owner; }
  add(...names) { names.forEach((name) => this.owner.classes.add(name)); }
  remove(...names) { names.forEach((name) => this.owner.classes.delete(name)); }
  contains(name) { return this.owner.classes.has(name); }
  toggle(name, force) {
    const enabled = force ?? !this.contains(name);
    enabled ? this.add(name) : this.remove(name);
    return enabled;
  }
}

class FakeElement {
  constructor(tagName = 'div', id = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.children = [];
    this.listeners = new Map();
    this.classes = new Set();
    this.classList = new FakeClassList(this);
    this.dataset = {};
    this.attributes = new Map();
    this.textContent = '';
    this.value = '';
    this.disabled = false;
    this.hidden = false;
    this.focused = false;
  }
  set className(value) { this.classes = new Set(String(value).split(/\s+/).filter(Boolean)); }
  get className() { return [...this.classes].join(' '); }
  append(...nodes) { this.children.push(...nodes); }
  appendChild(node) { this.append(node); return node; }
  replaceChildren(...nodes) { this.children = [...nodes]; }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(listener);
  }
  async dispatch(type, event = {}) {
    for (const listener of this.listeners.get(type) || []) {
      await listener({ preventDefault() {}, target: this, ...event });
    }
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name); }
  focus() { this.focused = true; }
}

class FakeDocument {
  constructor() {
    this.elements = new Map();
    this.body = new FakeElement('body');
    this.activeElement = null;
  }
  createElement(tagName) { return new FakeElement(tagName); }
  getElementById(id) { return this.elements.get(id) || null; }
  add(id, tag = 'div') {
    const element = new FakeElement(tag, id);
    this.elements.set(id, element);
    return element;
  }
}

function find(root, predicate) {
  if (predicate(root)) return root;
  for (const child of root.children) {
    const match = find(child, predicate);
    if (match) return match;
  }
  return null;
}

function setup({ documentCount = 1, directories } = {}) {
  const root = new FakeDocument();
  const ids = [
    'documentsContent', 'directoryManageBtn', 'directoryModal', 'directoryModalBody',
    'mainApp',
    'directoryCreateForm', 'directoryNameInput', 'directoryCreateBtn', 'directoryModalError', 'directoryModalCloseBtn',
    'confirmModal', 'confirmTitle', 'confirmMessage', 'confirmError', 'confirmAcceptBtn', 'confirmCancelBtn',
  ];
  ids.forEach((id) => root.add(id, id.includes('Btn') ? 'button' : id.includes('Form') ? 'form' : 'div'));
  root.getElementById('directoryModal').classList.add('hidden');
  root.getElementById('confirmModal').classList.add('hidden');

  let state = {
    status: 'ready',
    directories: directories || [{ id: 'dir-1', name: '产品文档', documentCount, sortOrder: 0, createdAt: '2026-01-01', updatedAt: '2026-01-01' }],
    documents: documentCount ? [{
      id: 'doc-1', directoryId: 'dir-1', title: '标题',
      description: '<script>alert(1)</script>', createdAt: '2026-01-01', updatedAt: '2026-01-01',
    }] : [],
    editor: null,
    error: '',
  };
  const calls = [];
  let subscriber;
  const store = {
    getState: () => structuredClone(state),
    subscribe(fn) { subscriber = fn; fn(this.getState()); return () => {}; },
    load: async () => calls.push(['load']),
    reset: () => calls.push(['reset']),
    beginEdit: (id) => calls.push(['beginEdit', id]),
    beginAdd: (id) => calls.push(['beginAdd', id]),
    cancelEdit: () => calls.push(['cancelEdit']),
    updateDraft: (patch) => calls.push(['updateDraft', patch]),
    saveDraft: async () => calls.push(['saveDraft']),
    deleteDocument: async (id) => calls.push(['deleteDocument', id]),
    createDirectory: async (name) => calls.push(['createDirectory', name]),
    renameDirectory: async (id, name) => calls.push(['renameDirectory', id, name]),
    deleteDirectory: async (id) => calls.push(['deleteDirectory', id]),
    moveDirectory: async (id, direction) => calls.push(['moveDirectory', id, direction]),
  };
  const ui = createDocumentLinksUi({ root, store });
  return {
    root, store, calls, ui,
    update(patch) { state = { ...state, ...patch }; subscriber(store.getState()); },
  };
}

test('description is plain text and only title starts editing', async () => {
  const { root, calls } = setup();
  const content = root.getElementById('documentsContent');
  const description = find(content, (item) => item.classList.contains('document-row__description'));
  const title = find(content, (item) => item.classList.contains('document-row__title'));
  assert.equal(description.textContent, '<script>alert(1)</script>');
  assert.equal(find(content, (item) => item.tagName === 'A'), null);
  await description.dispatch('click');
  assert.deepEqual(calls, []);
  await title.dispatch('click');
  assert.deepEqual(calls, [['beginEdit', 'doc-1']]);
});

test('add calls beginAdd for its directory', async () => {
  const { root, calls } = setup({ documentCount: 0 });
  const add = find(root.getElementById('documentsContent'), (item) => item.dataset.action === 'add-document');
  await add.dispatch('click');
  assert.deepEqual(calls, [['beginAdd', 'dir-1']]);
});

test('editor renders title description directory and save cancel controls', async () => {
  const context = setup({ documentCount: 0 });
  context.update({ editor: {
    mode: 'add', documentId: null, draft: { directoryId: 'dir-1', title: '', description: '' },
    errors: {}, error: '', saving: false,
  } });
  const content = context.root.getElementById('documentsContent');
  assert.ok(find(content, (item) => item.dataset.field === 'title'));
  assert.ok(find(content, (item) => item.dataset.field === 'description'));
  assert.ok(find(content, (item) => item.dataset.field === 'directoryId'));
  await find(content, (item) => item.dataset.action === 'cancel-editor').dispatch('click');
  assert.deepEqual(context.calls, [['cancelEdit']]);
});

test('editor groups title and directory above a full-width description and compact footer', () => {
  const context = setup({ documentCount: 0 });
  context.update({ editor: {
    mode: 'add', documentId: null, draft: { directoryId: 'dir-1', title: '', description: '' },
    errors: {}, error: '', saving: false,
  } });
  const content = context.root.getElementById('documentsContent');
  const top = find(content, (item) => item.classList.contains('document-editor__top-fields'));
  const description = find(content, (item) => item.classList.contains('document-field--description'));
  const footer = find(content, (item) => item.classList.contains('document-editor__footer'));
  assert.ok(top);
  assert.ok(find(top, (item) => item.dataset.field === 'title'));
  assert.ok(find(top, (item) => item.dataset.field === 'directoryId'));
  assert.ok(find(description, (item) => item.dataset.field === 'description'));
  assert.ok(find(footer, (item) => item.dataset.action === 'save-editor'));
});

test('draft input updates do not replace the focused editor DOM', async () => {
  const context = setup({ documentCount: 0 });
  const editor = {
    mode: 'add', documentId: null, draft: { directoryId: 'dir-1', title: '', description: '' },
    errors: {}, error: '', saving: false,
  };
  context.update({ editor });
  const content = context.root.getElementById('documentsContent');
  const title = find(content, (item) => item.dataset.field === 'title');
  await title.dispatch('input', { target: { value: '文' } });
  context.update({ editor: { ...editor, draft: { ...editor.draft, title: '文' } } });
  assert.equal(find(content, (item) => item.dataset.field === 'title'), title);
});

test('moving an edit draft renders exactly one editor in the target directory', () => {
  const context = setup();
  const secondDirectory = { id: 'dir-2', name: '销售政策', documentCount: 0, createdAt: '2026-01-02', updatedAt: '2026-01-02' };
  context.update({
    directories: [...context.store.getState().directories, secondDirectory],
    editor: {
      mode: 'edit', documentId: 'doc-1', draft: { directoryId: 'dir-2', title: '标题', description: '描述' },
      errors: {}, error: '', saving: false,
    },
  });
  const editors = [];
  const collect = (node) => {
    if (node.classList.contains('document-editor')) editors.push(node);
    node.children.forEach(collect);
  };
  collect(context.root.getElementById('documentsContent'));
  assert.equal(editors.length, 1);
});

test('non-empty directory deletion is disabled with explanatory copy', async () => {
  const { root } = setup();
  await root.getElementById('directoryManageBtn').dispatch('click');
  const remove = find(root.getElementById('directoryModalBody'), (item) => item.dataset.action === 'delete-directory');
  assert.equal(remove.disabled, true);
  assert.match(remove.getAttribute('title'), /先删除或移动/);
});

test('confirmation runs destructive action only after acceptance and restores focus', async () => {
  const { root, calls } = setup();
  const remove = find(root.getElementById('documentsContent'), (item) => item.dataset.action === 'delete-document');
  await remove.dispatch('click');
  assert.deepEqual(calls, []);
  await root.getElementById('confirmCancelBtn').dispatch('click');
  assert.deepEqual(calls, []);
  assert.equal(remove.focused, true);

  await remove.dispatch('click');
  await root.getElementById('confirmAcceptBtn').dispatch('click');
  assert.deepEqual(calls, [['deleteDocument', 'doc-1']]);
});

test('confirmation keeps the dialog open and displays destructive action errors', async () => {
  const context = setup();
  context.store.deleteDocument = async () => { throw new Error('删除失败'); };
  const remove = find(context.root.getElementById('documentsContent'), (item) => item.dataset.action === 'delete-document');
  await remove.dispatch('click');
  await context.root.getElementById('confirmAcceptBtn').dispatch('click');
  assert.equal(context.root.getElementById('confirmModal').classList.contains('hidden'), false);
  assert.equal(context.root.getElementById('confirmError').textContent, '删除失败');
});

test('modals make background layers inert and directory deletion restores focus inside its modal', async () => {
  const context = setup({ documentCount: 0 });
  const mainApp = context.root.getElementById('mainApp');
  await context.root.getElementById('directoryManageBtn').dispatch('click');
  assert.equal(mainApp.inert, true);
  const remove = find(context.root.getElementById('directoryModalBody'), (item) => item.dataset.action === 'delete-directory');
  await remove.dispatch('click');
  assert.equal(context.root.getElementById('directoryModal').inert, true);
  await context.root.getElementById('confirmAcceptBtn').dispatch('click');
  assert.equal(context.root.getElementById('directoryModal').inert, false);
  assert.equal(context.root.getElementById('directoryNameInput').focused, true);
  await context.root.getElementById('directoryModalCloseBtn').dispatch('click');
  assert.equal(mainApp.inert, false);
});

test('active editor disables other actions with the save-or-cancel explanation', () => {
  const context = setup();
  context.update({ editor: {
    mode: 'edit', documentId: 'doc-1', draft: { directoryId: 'dir-1', title: '标题', description: '描述' },
    errors: {}, error: '', saving: false,
  } });
  const add = find(context.root.getElementById('documentsContent'), (item) => item.dataset.action === 'add-document');
  assert.equal(add.disabled, true);
  assert.equal(add.getAttribute('title'), '请先保存或取消当前编辑');
});

test('directory manager exposes one-step move controls with boundary states', async () => {
  const context = setup({ documentCount: 0, directories: [
    { id: 'a', name: 'A', documentCount: 0, sortOrder: 0, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
    { id: 'b', name: 'B', documentCount: 0, sortOrder: 1, createdAt: '2026-01-02', updatedAt: '2026-01-02' },
    { id: 'c', name: 'C', documentCount: 0, sortOrder: 2, createdAt: '2026-01-03', updatedAt: '2026-01-03' },
  ] });
  await context.root.getElementById('directoryManageBtn').dispatch('click');
  const body = context.root.getElementById('directoryModalBody');
  const upButtons = [];
  const downButtons = [];
  const collect = (node) => {
    if (node.dataset.action === 'move-directory-up') upButtons.push(node);
    if (node.dataset.action === 'move-directory-down') downButtons.push(node);
    node.children.forEach(collect);
  };
  collect(body);
  assert.equal(upButtons.length, 3);
  assert.equal(upButtons[0].disabled, true);
  assert.equal(downButtons[2].disabled, true);
  await upButtons[1].dispatch('click');
  assert.deepEqual(context.calls.at(-1), ['moveDirectory', 'b', 'up']);
});

test('directory move errors remain visible in the management dialog', async () => {
  const context = setup({ documentCount: 0, directories: [
    { id: 'a', name: 'A', documentCount: 0, sortOrder: 0, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
    { id: 'b', name: 'B', documentCount: 0, sortOrder: 1, createdAt: '2026-01-02', updatedAt: '2026-01-02' },
  ] });
  context.store.moveDirectory = async () => { throw new Error('移动失败'); };
  await context.root.getElementById('directoryManageBtn').dispatch('click');
  const down = find(context.root.getElementById('directoryModalBody'), (item) => item.dataset.action === 'move-directory-down' && !item.disabled);
  await down.dispatch('click');
  assert.equal(context.root.getElementById('directoryModalError').textContent, '移动失败');
  assert.equal(context.root.getElementById('directoryModal').classList.contains('hidden'), false);
});

test('a pending directory move blocks rename and delete actions', async () => {
  let releaseMove;
  const context = setup({ documentCount: 0, directories: [
    { id: 'a', name: 'A', documentCount: 0, sortOrder: 0, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
    { id: 'b', name: 'B', documentCount: 0, sortOrder: 1, createdAt: '2026-01-02', updatedAt: '2026-01-02' },
  ] });
  context.store.moveDirectory = () => new Promise((resolve) => { releaseMove = resolve; });
  await context.root.getElementById('directoryManageBtn').dispatch('click');
  const down = find(context.root.getElementById('directoryModalBody'), (item) => item.dataset.action === 'move-directory-down' && !item.disabled);
  const pending = down.dispatch('click');
  const rename = find(context.root.getElementById('directoryModalBody'), (item) => item.dataset.action === 'rename-directory');
  const remove = find(context.root.getElementById('directoryModalBody'), (item) => item.dataset.action === 'delete-directory');
  assert.equal(rename.disabled, true);
  assert.equal(remove.disabled, true);
  assert.equal(context.root.getElementById('directoryCreateBtn').disabled, true);
  releaseMove();
  await pending;
});
