// 数据迁移脚本：从飞书导出数据并生成 D1 导入 SQL
// 运行方式: node migrate/export-and-generate-sql.js

const APP_ID = 'cli_a927c34524f8dbef';
const APP_TOKEN = 'OftMbXMpAapkcssDyXTc6USlnEg';
const TABLE_ID = 'tblZKtePBKg6T21x';

// 需要从环境变量获取的飞书 app_secret
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET || 'wgWrVSmfxVfk3HDbqsk1khnAoTG5wWI4';

const DATE_FIELDS = ['date', 'weekStart', 'createdAt'];

async function getAccessToken() {
  const response = await fetch(
    'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: APP_ID, app_secret: FEISHU_APP_SECRET }),
    }
  );
  const data = await response.json();
  if (data.code === 0) {
    return data.tenant_access_token;
  }
  throw new Error('Failed to get access token: ' + JSON.stringify(data));
}

function fieldsFromFeishu(fields) {
  const result = {};
  for (const [key, value] of Object.entries(fields)) {
    if (DATE_FIELDS.includes(key) && typeof value === 'number') {
      if (key === 'createdAt') {
        result[key] = new Date(value).toISOString();
      } else {
        // 使用 Asia/Shanghai 时区
        result[key] = new Date(value).toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' });
      }
    } else {
      result[key] = value;
    }
  }
  return result;
}

async function fetchAllTodos() {
  const token = await getAccessToken();
  const baseUrl = `https://open.feishu.cn/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}`;

  const response = await fetch(`${baseUrl}/records?page_size=500`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  const data = await response.json();

  if (data.code !== 0) {
    throw new Error('Failed to fetch todos: ' + JSON.stringify(data));
  }

  const rawItems = data.data?.items ?? data.data?.records ?? [];

  return rawItems.map((item) => {
    const fields = fieldsFromFeishu(item.fields || {});
    return {
      id: fields.id || item.record_id || item.id,
      type: fields.type || 'A',
      title: fields.title || '',
      done: fields.done ? 1 : 0,
      date: fields.date || null,
      weekStart: fields.weekStart || null,
      delayed: fields.delayed ? 1 : 0,
      createdAt: fields.createdAt || new Date().toISOString(),
    };
  });
}

function generateSQL(todos) {
  if (todos.length === 0) {
    return '-- 没有数据需要迁移\n';
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

async function main() {
  console.log('开始从飞书导出数据...');
  console.log(`使用 APP_ID: ${APP_ID}`);
  console.log(`使用 TABLE_ID: ${TABLE_ID}`);

  try {
    const todos = await fetchAllTodos();
    console.log(`✅ 成功导出 ${todos.length} 条记录`);

    if (todos.length > 0) {
      const sql = generateSQL(todos);

      // 保存到文件
      const fs = require('fs');
      const path = require('path');
      const outputPath = path.join(__dirname, 'data.sql');

      fs.writeFileSync(outputPath, sql, 'utf-8');
      console.log(`\n✅ SQL 文件已生成: ${outputPath}`);
      console.log(`\n执行以下命令导入数据:`);
      console.log(`npx wrangler d1 execute xiaohutodo-db --remote --file=./migrate/data.sql`);

      // 显示前 5 条数据预览
      console.log('\n数据预览 (前 5 条):');
      todos.slice(0, 5).forEach((todo, i) => {
        console.log(`  ${i + 1}. [${todo.type}] ${todo.title.substring(0, 30)}${todo.title.length > 30 ? '...' : ''}`);
      });
    } else {
      console.log('⚠️ 飞书中没有数据需要迁移');
    }
  } catch (error) {
    console.error('❌ 导出失败:', error.message);
    process.exit(1);
  }
}

main();
