ALTER TABLE protocols ADD COLUMN deadline TEXT;

CREATE INDEX IF NOT EXISTS idx_protocols_deadline ON protocols(deadline);
