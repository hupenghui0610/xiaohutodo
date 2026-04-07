/**
 * 数据迁移脚本：从飞书导出数据，生成 D1 导入 SQL
 *
 * 使用方法:
 * 1. 先在浏览器中登录应用
 * 2. 打开开发者工具 -> Console
 * 3. 复制此脚本内容粘贴执行
 * 4. 复制输出的 SQL 语句
 * 5. 保存到 migrate/data.sql 文件
 * 6. 运行: npx wrangler d1 execute xiaohutodo-db --file=./migrate/data.sql
 */

// 导出函数
async function exportFromFeishu() {
  const API_BASE = '/api/feishu';

  function getAuthHeaders() {
    const token = localStorage.getItem('auth_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    return headers;
  }

  try {
    const response = await fetch(API_BASE, {
      method: 'GET',
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error('获取数据失败: ' + response.status);
    }

    const data = await response.json();

    if (data.code === 0 && data.data && data.data.items) {
      return data.data.items.map(item => ({
        id: item.fields?.id || item.record_id || item.id,
        type: item.fields?.type || 'A',
        title: item.fields?.title || '',
        done: item.fields?.done ? 1 : 0,
        date: item.fields?.date || null,
        weekStart: item.fields?.weekStart || null,
        delayed: item.fields?.delayed ? 1 : 0,
        createdAt: item.fields?.createdAt || new Date().toISOString(),
      }));
    }
    return [];
  } catch (error) {
    console.error('导出失败:', error);
    return [];
  }
}

// 生成 SQL 插入语句
function generateSQL(todos) {
  if (todos.length === 0) {
    return '-- 没有数据需要迁移';
  }

  let sql = `-- 从飞书导出的数据迁移 SQL
-- 生成时间: ${new Date().toISOString()}
-- 记录数: ${todos.length}

`;

  for (const todo of todos) {
    const escapedTitle = todo.title.replace(/'/g, "''");
    sql += `INSERT INTO todos (id, type, title, done, date, weekStart, delayed, createdAt) VALUES ('${todo.id}', '${todo.type}', '${escapedTitle}', ${todo.done}, ${todo.date ? `'${todo.date}'` : 'NULL'}, ${todo.weekStart ? `'${todo.weekStart}'` : 'NULL'}, ${todo.delayed}, '${todo.createdAt}');\n`;
  }

  return sql;
}

// 主函数
async function migrate() {
  console.log('开始从飞书导出数据...');
  const todos = await exportFromFeishu();
  console.log(`导出成功，共 ${todos.length} 条记录`);

  if (todos.length > 0) {
    const sql = generateSQL(todos);
    console.log('\n========== 复制以下 SQL 到 migrate/data.sql ==========\n');
    console.log(sql);
    console.log('\n========== SQL 结束 ==========');

    // 同时返回数据以便其他用途
    return { todos, sql };
  }

  return { todos: [], sql: '' };
}

// 自动执行
migrate().then(result => {
  if (result.todos.length > 0) {
    console.log('\n✅ 导出完成！请按照脚本头部注释的说明导入数据。');
  } else {
    console.log('\n⚠️ 没有数据需要导出');
  }
}).catch(err => {
  console.error('迁移失败:', err);
});
