-- Ensure RLS is enabled
ALTER TABLE circles ENABLE ROW LEVEL SECURITY;
ALTER TABLE circle_members ENABLE ROW LEVEL SECURITY;

-- Drop old policies first (safe even if they don't exist)
DROP POLICY IF EXISTS "Anyone can view circles" ON circles;
DROP POLICY IF EXISTS "Anyone can view circle members" ON circle_members;

-- Allow any authenticated user to look up circles (needed for join-by-code)
CREATE POLICY "Anyone can view circles" ON circles FOR SELECT USING (true);

-- Allow any authenticated user to look up circle members
CREATE POLICY "Anyone can view circle members" ON circle_members FOR SELECT USING (true);

-- Insert member: either yourself (join via code) or if you own the circle (add member)
DROP POLICY IF EXISTS "Users can join circles" ON circle_members;
CREATE POLICY "Users can manage circle members" ON circle_members
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM circles WHERE id = circle_id AND owner_id = auth.uid())
  );

-- Delete member: either yourself (leave circle) or if you own the circle (remove member)
DROP POLICY IF EXISTS "Users can leave circles" ON circle_members;
CREATE POLICY "Users can manage circle members delete" ON circle_members
  FOR DELETE USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM circles WHERE id = circle_id AND owner_id = auth.uid())
  );

-- Allow owners to update their own circles
DROP POLICY IF EXISTS "Owners can update circles" ON circles;
CREATE POLICY "Owners can update circles" ON circles FOR UPDATE USING (owner_id = auth.uid());
