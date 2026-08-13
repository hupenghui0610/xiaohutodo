ALTER TABLE document_directories
  ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

UPDATE document_directories AS current
SET sort_order = (
  SELECT COUNT(*)
  FROM document_directories AS earlier
  WHERE earlier.user_id = current.user_id
    AND (
      earlier.created_at < current.created_at
      OR (earlier.created_at = current.created_at AND earlier.id < current.id)
    )
);

CREATE INDEX idx_document_directories_user_order
  ON document_directories(user_id, sort_order, created_at, id);
