CREATE TABLE todos (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('A', 'B', 'C')),
  title TEXT NOT NULL,
  done INTEGER DEFAULT 0 CHECK(done IN (0, 1)),
  date TEXT,
  weekStart TEXT,
  delayed INTEGER DEFAULT 0 CHECK(delayed IN (0, 1)),
  createdAt TEXT NOT NULL
);

INSERT INTO todos (id, type, title, done, date, weekStart, delayed, createdAt)
VALUES ('legacy_todo', 'A', 'legacy item', 0, NULL, NULL, 0, '2026-01-01T00:00:00.000Z');
