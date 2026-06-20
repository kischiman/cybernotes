ALTER TABLE todos ADD COLUMN recurrence_frequency TEXT CHECK (recurrence_frequency IN ('daily', 'weekly', 'monthly') OR recurrence_frequency IS NULL);
ALTER TABLE todos ADD COLUMN recurrence_day INTEGER;
UPDATE todos SET recurrence_frequency = 'daily' WHERE recurrence = 'recurring' AND recurrence_frequency IS NULL;
