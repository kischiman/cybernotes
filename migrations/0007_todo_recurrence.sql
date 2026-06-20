ALTER TABLE todos ADD COLUMN recurrence TEXT NOT NULL DEFAULT 'one_off' CHECK (recurrence IN ('one_off', 'recurring'));
