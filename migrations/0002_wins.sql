CREATE TABLE IF NOT EXISTS wins (
  id TEXT PRIMARY KEY,
  body TEXT NOT NULL,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  created_at TEXT,
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_wins_created_at ON wins(created_at);
CREATE INDEX IF NOT EXISTS idx_wins_project_id ON wins(project_id);
