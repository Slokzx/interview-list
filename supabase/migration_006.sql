-- Add referred flag to applications
ALTER TABLE applications ADD COLUMN IF NOT EXISTS referred BOOLEAN DEFAULT FALSE;
