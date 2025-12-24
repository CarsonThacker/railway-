-- Add redacted_name column to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS redacted_name boolean DEFAULT false;

-- Update RLS policies for profiles to allow users to update their own redacted_name
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Allow service role and authenticated users to insert profiles
DROP POLICY IF EXISTS "Service role can insert profiles" ON profiles;
CREATE POLICY "Anyone can insert profiles"
  ON profiles FOR INSERT
  WITH CHECK (true);
