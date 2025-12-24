-- Add source_urls array column to documents table
ALTER TABLE documents ADD COLUMN IF NOT EXISTS source_urls TEXT[] DEFAULT '{}';

-- Migrate existing source_url to source_urls array
UPDATE documents 
SET source_urls = ARRAY[source_url] 
WHERE source_url IS NOT NULL AND (source_urls IS NULL OR source_urls = '{}');

-- Add pending_source_urls to pending_edits table
ALTER TABLE pending_edits ADD COLUMN IF NOT EXISTS pending_source_urls TEXT[] DEFAULT '{}';

-- Migrate existing pending_source_url to array
UPDATE pending_edits 
SET pending_source_urls = ARRAY[pending_source_url] 
WHERE pending_source_url IS NOT NULL AND (pending_source_urls IS NULL OR pending_source_urls = '{}');
