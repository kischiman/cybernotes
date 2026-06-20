CREATE TABLE IF NOT EXISTS visions (
  id TEXT PRIMARY KEY,
  body TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  goal TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  started_at TEXT,
  ended_at TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS protocols (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  goal TEXT,
  intervention TEXT,
  metrics TEXT,
  deadline TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS entries (
  id TEXT PRIMARY KEY,
  protocol_id TEXT NOT NULL REFERENCES protocols(id) ON DELETE CASCADE,
  body TEXT,
  tags TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS photos (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL,
  r2_url TEXT NOT NULL,
  caption TEXT,
  created_at TEXT
);

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

CREATE TABLE IF NOT EXISTS people (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  directory_id TEXT REFERENCES people_directory(id),
  name TEXT NOT NULL,
  note TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS todos (
  id TEXT PRIMARY KEY,
  protocol_id TEXT NOT NULL REFERENCES protocols(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1)),
  due_date TEXT,
  recurrence TEXT NOT NULL DEFAULT 'one_off' CHECK (recurrence IN ('one_off', 'recurring')),
  recurrence_frequency TEXT CHECK (recurrence_frequency IN ('daily', 'weekly', 'monthly') OR recurrence_frequency IS NULL),
  recurrence_day INTEGER,
  person_id TEXT REFERENCES people(id) ON DELETE SET NULL,
  person_role TEXT,
  position INTEGER,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS people_directory (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  note TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS todo_assignees (
  id TEXT PRIMARY KEY,
  todo_id TEXT NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL REFERENCES people_directory(id),
  role TEXT,
  created_at TEXT
);

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

CREATE TABLE IF NOT EXISTS wins (
  id TEXT PRIMARY KEY,
  body TEXT NOT NULL,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS articles (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  tags TEXT,
  consensus_body TEXT,
  websearch_body TEXT,
  europepmc_body TEXT,
  gossip_body TEXT,
  sources_consensus TEXT,
  sources_websearch TEXT,
  sources_europepmc TEXT,
  sources_gossip TEXT,
  prompt_consensus TEXT,
  prompt_websearch TEXT,
  prompt_europepmc TEXT,
  prompt_gossip TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_protocols_project_id ON protocols(project_id);
CREATE INDEX IF NOT EXISTS idx_protocols_deadline ON protocols(deadline);
CREATE INDEX IF NOT EXISTS idx_entries_protocol_id_created_at ON entries(protocol_id, created_at);
CREATE INDEX IF NOT EXISTS idx_photos_entry_id ON photos(entry_id);
CREATE INDEX IF NOT EXISTS idx_protocol_cycles_project_id_completed_at ON protocol_cycles(project_id, completed_at);
CREATE INDEX IF NOT EXISTS idx_protocol_cycles_protocol_id ON protocol_cycles(protocol_id);
CREATE INDEX IF NOT EXISTS idx_protocol_cycle_photos_cycle_id ON protocol_cycle_photos(cycle_id);
CREATE INDEX IF NOT EXISTS idx_people_project_id ON people(project_id);
CREATE INDEX IF NOT EXISTS idx_people_directory_project_people ON people(directory_id);
CREATE INDEX IF NOT EXISTS idx_people_directory_name ON people_directory(name);
CREATE INDEX IF NOT EXISTS idx_people_directory_updated_at ON people_directory(updated_at);
CREATE INDEX IF NOT EXISTS idx_todos_protocol_id_done ON todos(protocol_id, done);
CREATE INDEX IF NOT EXISTS idx_todos_position ON todos(position);
CREATE INDEX IF NOT EXISTS idx_todo_assignees_todo_id ON todo_assignees(todo_id);
CREATE INDEX IF NOT EXISTS idx_todo_assignees_person_id ON todo_assignees(person_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_checkin_entries_date_session ON checkin_entries(date, session);
CREATE INDEX IF NOT EXISTS idx_checkin_templates_session_position ON checkin_templates(session, position);
CREATE INDEX IF NOT EXISTS idx_checkin_answers_entry_id_position ON checkin_answers(entry_id, position);
CREATE INDEX IF NOT EXISTS idx_wins_created_at ON wins(created_at);
CREATE INDEX IF NOT EXISTS idx_wins_project_id ON wins(project_id);
CREATE INDEX IF NOT EXISTS idx_articles_updated_at ON articles(updated_at);
