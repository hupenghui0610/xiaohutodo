-- D1 数据库表结构
-- 用于替代飞书多维表格存储待办数据

CREATE TABLE IF NOT EXISTS todos (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('A', 'B', 'C')),
  title TEXT NOT NULL,
  done INTEGER DEFAULT 0 CHECK(done IN (0, 1)),
  date TEXT,
  weekStart TEXT,
  delayed INTEGER DEFAULT 0 CHECK(delayed IN (0, 1)),
  createdAt TEXT NOT NULL
);

-- 创建索引优化查询性能
CREATE INDEX IF NOT EXISTS idx_todos_type ON todos(type);
CREATE INDEX IF NOT EXISTS idx_todos_date ON todos(date);
CREATE INDEX IF NOT EXISTS idx_todos_weekStart ON todos(weekStart);
