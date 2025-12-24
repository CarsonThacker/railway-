-- Add pending_category column to pending_edits if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'pending_edits' AND column_name = 'pending_category'
  ) THEN
    ALTER TABLE pending_edits ADD COLUMN pending_category TEXT;
  END IF;
END $$;
