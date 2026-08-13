PRAGMA foreign_keys = ON;

CREATE TABLE document_directory_states (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  initialized_at TEXT NOT NULL
);

CREATE TABLE document_directories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, name_key)
);

CREATE TABLE document_links (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  directory_id TEXT NOT NULL REFERENCES document_directories(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_document_directories_user_created
  ON document_directories(user_id, created_at, id);
CREATE INDEX idx_document_links_user_created
  ON document_links(user_id, created_at DESC, id);
CREATE INDEX idx_document_links_user_directory
  ON document_links(user_id, directory_id);
