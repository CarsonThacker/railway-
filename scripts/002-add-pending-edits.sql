-- Add pending_edits table to track edits awaiting AI approval
CREATE TABLE IF NOT EXISTS pending_edits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  username TEXT NOT NULL,
  -- Pending edit data
  pending_title TEXT NOT NULL,
  pending_description TEXT,
  pending_content TEXT,
  pending_names TEXT[],
  -- AI moderation
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  ai_feedback TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add index for faster lookups
CREATE INDEX idx_pending_edits_document ON pending_edits(document_id);
CREATE INDEX idx_pending_edits_status ON pending_edits(status);

-- Update activities table to support more action types
ALTER TABLE activities 
DROP CONSTRAINT IF EXISTS activities_action_check;

ALTER TABLE activities
ADD CONSTRAINT activities_action_check 
CHECK (action IN ('added', 'edited', 'pending', 'approved', 'rejected'));

-- RLS for pending_edits
ALTER TABLE pending_edits ENABLE ROW LEVEL SECURITY;

-- Everyone can view pending edits
CREATE POLICY "Anyone can view pending edits" ON pending_edits
  FOR SELECT USING (true);

-- Authenticated users can create pending edits
CREATE POLICY "Authenticated users can create pending edits" ON pending_edits
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Only system can update pending edits (via service role)
CREATE POLICY "Service role can update pending edits" ON pending_edits
  FOR UPDATE USING (true);
