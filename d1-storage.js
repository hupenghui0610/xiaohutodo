const API_BASE = '/api/d1';

function todoPayload(todo) {
  return {
    id: todo.id,
    type: todo.type,
    title: todo.title,
    done: Boolean(todo.done),
    date: todo.date || null,
    weekStart: todo.weekStart || null,
    delayed: Boolean(todo.delayed),
    createdAt: todo.createdAt,
    updatedAt: todo.updatedAt || todo.createdAt,
  };
}

function cloneTodo(todo) {
  return JSON.parse(JSON.stringify(todoPayload(todo)));
}

async function apiRequest(method, body, query = '') {
  const response = await fetch(API_BASE + query, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));

  if (response.status === 401) {
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('auth-required'));
    throw new Error('登录状态已失效');
  }
  if (data.code === 'PASSWORD_CHANGE_REQUIRED') {
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('password-change-required'));
    throw new Error(data.message || '请先修改密码');
  }
  if (!response.ok) {
    const exception = new Error(data.message || '请求失败');
    exception.code = data.code;
    exception.current = data.current;
    exception.fields = data.fields || {};
    throw exception;
  }
  return data;
}

export const D1Storage = {
  snapshot: new Map(),
  revision: 0,
  lastConflict: null,

  async loadTodos() {
    return (await this.refreshTodos()).items;
  },

  async refreshTodos() {
    const data = await apiRequest('GET');
    const items = data.data?.items || [];
    this.replaceSnapshot(items, Number(data.data?.revision || 0));
    return { items, revision: this.revision };
  },

  replaceSnapshot(items, revision) {
    this.snapshot = new Map(items.map((todo) => [todo.id, cloneTodo(todo)]));
    this.revision = Number(revision || 0);
  },

  getRevision() {
    return this.revision;
  },

  async saveTodos(todos, { forceIds = new Set() } = {}) {
    const current = new Map(todos.map((todo) => [todo.id, cloneTodo(todo)]));
    this.lastConflict = null;
    let operationId = null;

    try {
      for (const todo of todos) {
        operationId = todo.id;
        const previous = this.snapshot.get(todo.id);
        let data = null;
        if (!previous) {
          data = await this.createTodo(todo);
        } else if (JSON.stringify(previous) !== JSON.stringify(cloneTodo(todo))) {
          data = await this.updateTodo(todo.id, todo, previous, forceIds.has(todo.id));
        }
        if (data?.todo) {
          Object.assign(todo, data.todo);
          current.set(todo.id, cloneTodo(todo));
        }
      }
      for (const id of this.snapshot.keys()) {
        operationId = id;
        if (!current.has(id)) await this.deleteTodo(id);
      }
      this.snapshot = current;
      return true;
    } catch (exception) {
      if (exception.code === 'EDIT_CONFLICT') {
        this.lastConflict = { id: operationId, current: exception.current || null };
        return false;
      }
      console.error('保存待办失败:', exception);
      return false;
    }
  },

  async createTodo(todo) {
    return apiRequest('POST', { fields: todoPayload(todo) });
  },

  async updateTodo(id, todo, previous, force = false) {
    return apiRequest('PUT', {
      id,
      fields: { ...todoPayload(todo), baseUpdatedAt: previous?.updatedAt, force },
    });
  },

  async deleteTodo(id) {
    await apiRequest('DELETE', null, `?id=${encodeURIComponent(id)}`);
    return true;
  },

  reset() {
    this.snapshot.clear();
    this.revision = 0;
    this.lastConflict = null;
  },
};

if (typeof window !== 'undefined') window.D1Storage = D1Storage;
