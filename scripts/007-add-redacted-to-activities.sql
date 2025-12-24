-- Add redacted column to activities table
ALTER TABLE activities ADD COLUMN IF NOT EXISTS redacted boolean DEFAULT false;

-- Update existing activities to not be redacted
UPDATE activities SET redacted = false WHERE redacted IS NULL;
