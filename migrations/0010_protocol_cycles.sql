CREATE TABLE IF NOT EXISTS protocol_cycles (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  protocol_id TEXT REFERENCES protocols(id) ON DELETE SET NULL,
  protocol_title TEXT NOT NULL,
  synthesis TEXT,
  notes TEXT,
  results TEXT,
  completed_at TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS protocol_cycle_photos (
  id TEXT PRIMARY KEY,
  cycle_id TEXT NOT NULL REFERENCES protocol_cycles(id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL,
  r2_url TEXT NOT NULL,
  caption TEXT,
  created_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_protocol_cycles_project_id_completed_at ON protocol_cycles(project_id, completed_at);
CREATE INDEX IF NOT EXISTS idx_protocol_cycles_protocol_id ON protocol_cycles(protocol_id);
CREATE INDEX IF NOT EXISTS idx_protocol_cycle_photos_cycle_id ON protocol_cycle_photos(cycle_id);
