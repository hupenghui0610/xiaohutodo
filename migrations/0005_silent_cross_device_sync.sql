ALTER TABLE todos
ADD COLUMN updatedAt TEXT;

UPDATE todos
SET updatedAt = createdAt
WHERE updatedAt IS NULL;

CREATE TABLE user_data_revisions (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  todos_revision INTEGER NOT NULL DEFAULT 0,
  directories_revision INTEGER NOT NULL DEFAULT 0,
  documents_revision INTEGER NOT NULL DEFAULT 0
);

CREATE TRIGGER bump_todos_revision_after_insert
AFTER INSERT ON todos
BEGIN
  INSERT INTO user_data_revisions (user_id, todos_revision)
  VALUES (NEW.user_id, 1)
  ON CONFLICT(user_id) DO UPDATE SET todos_revision = todos_revision + 1;
END;

CREATE TRIGGER bump_todos_revision_after_update
AFTER UPDATE ON todos
BEGIN
  INSERT INTO user_data_revisions (user_id, todos_revision)
  VALUES (NEW.user_id, 1)
  ON CONFLICT(user_id) DO UPDATE SET todos_revision = todos_revision + 1;
END;

CREATE TRIGGER bump_todos_revision_after_delete
AFTER DELETE ON todos
BEGIN
  INSERT INTO user_data_revisions (user_id, todos_revision)
  VALUES (OLD.user_id, 1)
  ON CONFLICT(user_id) DO UPDATE SET todos_revision = todos_revision + 1;
END;

CREATE TRIGGER bump_directories_revision_after_insert
AFTER INSERT ON document_directories
BEGIN
  INSERT INTO user_data_revisions (user_id, directories_revision)
  VALUES (NEW.user_id, 1)
  ON CONFLICT(user_id) DO UPDATE SET directories_revision = directories_revision + 1;
END;

CREATE TRIGGER bump_directories_revision_after_update
AFTER UPDATE ON document_directories
BEGIN
  INSERT INTO user_data_revisions (user_id, directories_revision)
  VALUES (NEW.user_id, 1)
  ON CONFLICT(user_id) DO UPDATE SET directories_revision = directories_revision + 1;
END;

CREATE TRIGGER bump_directories_revision_after_delete
AFTER DELETE ON document_directories
BEGIN
  INSERT INTO user_data_revisions (user_id, directories_revision)
  VALUES (OLD.user_id, 1)
  ON CONFLICT(user_id) DO UPDATE SET directories_revision = directories_revision + 1;
END;

CREATE TRIGGER bump_documents_revision_after_insert
AFTER INSERT ON document_links
BEGIN
  INSERT INTO user_data_revisions (user_id, documents_revision)
  VALUES (NEW.user_id, 1)
  ON CONFLICT(user_id) DO UPDATE SET documents_revision = documents_revision + 1;
END;

CREATE TRIGGER bump_documents_revision_after_update
AFTER UPDATE ON document_links
BEGIN
  INSERT INTO user_data_revisions (user_id, documents_revision)
  VALUES (NEW.user_id, 1)
  ON CONFLICT(user_id) DO UPDATE SET documents_revision = documents_revision + 1;
END;

CREATE TRIGGER bump_documents_revision_after_delete
AFTER DELETE ON document_links
BEGIN
  INSERT INTO user_data_revisions (user_id, documents_revision)
  VALUES (OLD.user_id, 1)
  ON CONFLICT(user_id) DO UPDATE SET documents_revision = documents_revision + 1;
END;
