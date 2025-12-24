-- Add source_url column to pending_edits if it doesn't exist
ALTER TABLE pending_edits 
ADD COLUMN IF NOT EXISTS pending_source_url TEXT;
