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

ALTER TABLE people ADD COLUMN directory_id TEXT REFERENCES people_directory(id);

INSERT OR IGNORE INTO people_directory (id, name, note, created_at, updated_at)
SELECT id, name, note, created_at, created_at FROM people
WHERE directory_id IS NULL;

UPDATE people SET directory_id = id WHERE directory_id IS NULL;

INSERT OR IGNORE INTO todo_assignees (id, todo_id, person_id, role, created_at)
SELECT lower(hex(randomblob(16))), id, person_id, person_role, created_at
FROM todos
WHERE person_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_people_directory_name ON people_directory(name);
CREATE INDEX IF NOT EXISTS idx_people_directory_updated_at ON people_directory(updated_at);
CREATE INDEX IF NOT EXISTS idx_people_directory_project_people ON people(directory_id);
CREATE INDEX IF NOT EXISTS idx_todo_assignees_todo_id ON todo_assignees(todo_id);
CREATE INDEX IF NOT EXISTS idx_todo_assignees_person_id ON todo_assignees(person_id);
