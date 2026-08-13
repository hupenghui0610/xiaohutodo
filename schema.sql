PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT,
  password_salt TEXT,
  password_iterations INTEGER,
  legacy_password_hash TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin', 'user')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'disabled')),
  must_change_password INTEGER NOT NULL DEFAULT 1 CHECK(must_change_password IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  last_active_at TEXT NOT NULL,
  idle_expires_at TEXT NOT NULL,
  absolute_expires_at TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(idle_expires_at, absolute_expires_at);

CREATE TABLE IF NOT EXISTS login_attempts (
  subject TEXT PRIMARY KEY,
  failed_count INTEGER NOT NULL DEFAULT 0,
  window_started_at TEXT NOT NULL,
  locked_until TEXT
);

CREATE TABLE IF NOT EXISTS todos (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('A', 'B', 'C')),
  title TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0 CHECK(done IN (0, 1)),
  date TEXT,
  weekStart TEXT,
  delayed INTEGER NOT NULL DEFAULT 0 CHECK(delayed IN (0, 1)),
  createdAt TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_todos_user_created ON todos(user_id, createdAt DESC);
CREATE INDEX IF NOT EXISTS idx_todos_user_type ON todos(user_id, type);
CREATE INDEX IF NOT EXISTS idx_todos_user_date ON todos(user_id, date);
CREATE INDEX IF NOT EXISTS idx_todos_user_week_start ON todos(user_id, weekStart);

CREATE TABLE IF NOT EXISTS document_directory_states (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  initialized_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS document_directories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, name_key)
);

CREATE TABLE IF NOT EXISTS document_links (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  directory_id TEXT NOT NULL REFERENCES document_directories(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_document_directories_user_created
  ON document_directories(user_id, created_at, id);
CREATE INDEX IF NOT EXISTS idx_document_links_user_created
  ON document_links(user_id, created_at DESC, id);
CREATE INDEX IF NOT EXISTS idx_document_links_user_directory
  ON document_links(user_id, directory_id);

INSERT OR IGNORE INTO users (
  id, username, legacy_password_hash, role, status,
  must_change_password, created_at, updated_at
) VALUES (
  'admin_hupenghui',
  'hupenghui',
  '15dede3fbce896818be87fd3440d69f83601144367bcd64367e847feb2a52e40',
  'admin',
  'active',
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);
