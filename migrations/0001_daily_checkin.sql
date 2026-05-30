CREATE TABLE IF NOT EXISTS checkin_templates (
  id TEXT PRIMARY KEY,
  session TEXT NOT NULL CHECK (session IN ('morning', 'evening')),
  question TEXT NOT NULL,
  position INTEGER NOT NULL,
  created_at TEXT,
  archived_at TEXT
);

CREATE TABLE IF NOT EXISTS checkin_entries (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  session TEXT NOT NULL CHECK (session IN ('morning', 'evening')),
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS checkin_answers (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL REFERENCES checkin_entries(id) ON DELETE CASCADE,
  template_id TEXT NOT NULL REFERENCES checkin_templates(id),
  question_snapshot TEXT NOT NULL,
  answer TEXT,
  position INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_checkin_entries_date_session ON checkin_entries(date, session);
CREATE INDEX IF NOT EXISTS idx_checkin_templates_session_position ON checkin_templates(session, position);
CREATE INDEX IF NOT EXISTS idx_checkin_answers_entry_id_position ON checkin_answers(entry_id, position);
