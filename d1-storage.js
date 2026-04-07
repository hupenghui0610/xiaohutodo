// D1 数据库 API 配置
const API_BASE = '/api/d1';

function getAuthHeaders() {
  const token = localStorage.getItem('auth_token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  return headers;
}

function handleUnauthorized(response) {
  if (response.status === 401) {
    localStorage.removeItem('auth_token');
    location.reload();
    throw new Error('unauthorized');
  }
}

// D1 数据存储适配器
const D1Storage = {
  // 从 D1 加载所有待办
  async loadTodos() {
    try {
      const response = await fetch(API_BASE, {
        method: 'GET',
        headers: getAuthHeaders(),
      });
      handleUnauthorized(response);
      const data = await response.json();

      if (data.code === 0 && data.data && data.data.items) {
        // D1 返回的数据格式已经与前端期望的一致
        return data.data.items;
      }
      return [];
    } catch (error) {
      if (error.message === 'unauthorized') throw error;
      console.error('加载待办失败:', error);
      alert('从数据库加载数据失败，请检查网络连接');
      return [];
    }
  },

  // 保存所有待办到 D1
  // 策略：获取现有记录，对比差异，进行增删改
  async saveTodos(todos) {
    try {
      // 获取现有记录
      const existingTodos = await this.loadTodos();
      const existingIds = new Set(existingTodos.map(t => t.id));
      const newIds = new Set(todos.map(t => t.id));

      // 分类处理
      const toCreate = todos.filter(t => !existingIds.has(t.id));
      const toUpdate = todos.filter(t => existingIds.has(t.id));
      const toDelete = existingTodos.filter(t => !newIds.has(t.id));

      // 批量创建
      for (const todo of toCreate) {
        await this.createTodo(todo);
      }

      // 批量更新
      for (const todo of toUpdate) {
        await this.updateTodo(todo.id, todo);
      }

      // 批量删除
      for (const todo of toDelete) {
        await this.deleteTodo(todo.id);
      }

      return true;
    } catch (error) {
      console.error('保存待办失败:', error);
      alert('保存到数据库失败，请检查网络连接');
      return false;
    }
  },

  // 创建单个待办
  async createTodo(todo) {
    try {
      const response = await fetch(API_BASE, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          fields: {
            id: todo.id,
            type: todo.type,
            title: todo.title,
            done: todo.done,
            date: todo.date,
            weekStart: todo.weekStart,
            delayed: todo.delayed,
            createdAt: todo.createdAt,
          },
        }),
      });
      handleUnauthorized(response);
      const data = await response.json();
      return data.code === 0;
    } catch (error) {
      console.error('创建待办失败:', error);
      return false;
    }
  },

  // 更新单个待办
  // 注意：D1 使用 id 作为主键，不需要 recordId
  async updateTodo(id, todo) {
    try {
      const response = await fetch(API_BASE, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          id: id,
          fields: {
            type: todo.type,
            title: todo.title,
            done: todo.done,
            date: todo.date,
            weekStart: todo.weekStart,
            delayed: todo.delayed,
            createdAt: todo.createdAt,
          },
        }),
      });
      handleUnauthorized(response);
      const data = await response.json();
      return data.code === 0;
    } catch (error) {
      console.error('更新待办失败:', error);
      return false;
    }
  },

  // 删除单个待办
  // 注意：D1 使用 id 直接删除，不需要 recordId
  async deleteTodo(id) {
    if (!id) {
      console.error('删除待办失败：缺少 id');
      return false;
    }
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25000);
      const response = await fetch(API_BASE, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ action: 'delete', id: id }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      handleUnauthorized(response);
      const text = await response.text();
      let data = {};
      try {
        data = text && text.trim() ? JSON.parse(text) : {};
      } catch (e) {
        // 响应非 JSON 时按空对象处理，仅依据 status 判断
      }
      // 2xx 且无错误码或 code 为 0 即视为成功；解析失败时 2xx 也视为成功
      const ok = response.ok && (data.code === undefined || data.code === 0);
      if (!ok) console.error('删除接口返回异常', response.status, data);
      return ok;
    } catch (error) {
      console.error('删除待办失败:', error);
      return false;
    }
  },
};

// 导出供 HTML 使用
window.D1Storage = D1Storage;
