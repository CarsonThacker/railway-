-- Add file storage columns to documents table
ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_url TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_size BIGINT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

-- Add file storage columns to pending_edits table
ALTER TABLE pending_edits ADD COLUMN IF NOT EXISTS pending_file_url TEXT;
ALTER TABLE pending_edits ADD COLUMN IF NOT EXISTS pending_file_size BIGINT;
ALTER TABLE pending_edits ADD COLUMN IF NOT EXISTS pending_thumbnail_url TEXT;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_documents_file_type ON documents(file_type);
