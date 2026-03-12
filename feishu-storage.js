// 飞书 API 配置
const API_BASE = '/api/feishu';

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

// 飞书数据存储适配器
const FeishuStorage = {
  // 从飞书加载所有待办
  async loadTodos() {
    try {
      const response = await fetch(API_BASE, {
        method: 'GET',
        headers: getAuthHeaders(),
      });
      handleUnauthorized(response);
      const data = await response.json();
      
      if (data.code === 0 && data.data && data.data.items) {
        return data.data.items.map(item => {
          const recordId = item.record_id ?? item.recordId ?? (String(item.id || '').startsWith('rec') ? item.id : null);
          return {
            id: item.fields?.id || item.record_id || item.id,
            type: item.fields?.type || 'A',
            title: item.fields?.title || '',
            done: item.fields?.done || false,
            date: item.fields?.date ?? null,
            weekStart: item.fields?.weekStart ?? null,
            delayed: item.fields?.delayed || false,
            createdAt: item.fields?.createdAt || new Date().toISOString(),
            _recordId: recordId,
          };
        });
      }
      return [];
    } catch (error) {
      if (error.message === 'unauthorized') throw error;
      console.error('加载待办失败:', error);
      alert('从飞书加载数据失败，请检查网络连接');
      return [];
    }
  },

  // 保存所有待办到飞书
  async saveTodos(todos) {
    try {
      // 获取现有记录
      const existingTodos = await this.loadTodos();
      const existingIds = new Set(existingTodos.map(t => t.id));

      // 分类处理：新增、更新、删除（同一 id 在飞书有多条时，只保留一条用于更新，其余删掉）
      const toCreate = todos.filter(t => !existingIds.has(t.id));
      const toUpdate = todos.filter(t => existingIds.has(t.id));
      const idKept = new Set();
      const toDelete = existingTodos.filter((t) => {
        const hasLocal = todos.some((todo) => todo.id === t.id);
        if (!hasLocal) return true;
        if (idKept.has(t.id)) return true;
        idKept.add(t.id);
        return false;
      });

      // 批量创建
      for (const todo of toCreate) {
        await this.createTodo(todo);
      }

      // 批量更新
      for (const todo of toUpdate) {
        const existing = existingTodos.find(t => t.id === todo.id);
        if (existing) {
          await this.updateTodo(existing._recordId, todo);
        }
      }

      // 批量删除
      for (const todo of toDelete) {
        const ok = await this.deleteTodo(todo._recordId);
        if (!ok) return false;
      }

      return true;
    } catch (error) {
      console.error('保存待办失败:', error);
      alert('保存到飞书失败，请检查网络连接');
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
  async updateTodo(recordId, todo) {
    try {
      const response = await fetch(API_BASE, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          record_id: recordId,
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
      console.error('更新待办失败:', error);
      return false;
    }
  },

  // 删除单个待办（用 POST action 传 record_id）
  async deleteTodo(recordId) {
    if (!recordId || String(recordId).trim() === '') {
      console.error('删除待办失败：缺少 record_id');
      return false;
    }
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25000);
      const response = await fetch(API_BASE, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ action: 'delete', record_id: String(recordId).trim() }),
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
window.FeishuStorage = FeishuStorage;
