ALTER TABLE todos ADD COLUMN position INTEGER;

UPDATE todos
SET position = rowid
WHERE position IS NULL;

CREATE INDEX IF NOT EXISTS idx_todos_position ON todos(position);
