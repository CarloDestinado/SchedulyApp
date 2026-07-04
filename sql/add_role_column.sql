-- Migration: Replace can_edit boolean with role enum (member/admin/owner)

-- 1. Add the role column with a check constraint
ALTER TABLE circle_members ADD COLUMN role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin', 'owner'));

-- 2. Migrate existing data: can_edit=true → admin, can_edit=false → member
UPDATE circle_members SET role = 'admin' WHERE can_edit = true;
UPDATE circle_members SET role = 'member' WHERE can_edit = false OR can_edit IS NULL;

-- 3. Ensure the circle owner always has role='owner'
UPDATE circle_members cm
SET role = 'owner'
FROM circles c
WHERE cm.circle_id = c.id AND cm.user_id = c.owner_id;

-- 4. Drop the old column (CASCADE drops any policies referencing can_edit)
ALTER TABLE circle_members DROP COLUMN can_edit CASCADE;

-- 5. Drop old RLS policies that reference can_edit (there are none directly,
--    but we need to update member-management policies for role-based gating)

-- Drop old policies
DROP POLICY IF EXISTS "Users can manage circle members" ON circle_members;
DROP POLICY IF EXISTS "Users can manage circle members delete" ON circle_members;

-- Recreate INSERT policy: any authenticated user can join themselves,
-- but adding others requires admin or owner role in the circle
CREATE POLICY "Users can manage circle members insert" ON circle_members
  FOR INSERT WITH CHECK (
    -- Self-join: anyone can join
    auth.uid() = user_id
    OR
    -- Adding others: must be admin or owner of the circle
    EXISTS (
      SELECT 1 FROM circle_members cm
      WHERE cm.circle_id = circle_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('admin', 'owner')
    )
    OR
    -- Also allow the circles.owner_id (legacy fallback)
    EXISTS (SELECT 1 FROM circles WHERE id = circle_id AND owner_id = auth.uid())
  );

-- Recreate DELETE policy:
-- - Users can remove themselves
-- - Owners can remove anyone
-- - Admins can remove members (but not other admins or the owner)
CREATE POLICY "Users can manage circle members delete" ON circle_members
  FOR DELETE USING (
    auth.uid() = user_id
    OR
    EXISTS (SELECT 1 FROM circles WHERE id = circle_id AND owner_id = auth.uid())
    OR
    (
      EXISTS (
        SELECT 1 FROM circle_members cm
        WHERE cm.circle_id = circle_id AND cm.user_id = auth.uid() AND cm.role = 'admin'
      )
      AND role = 'member'
    )
  );

-- Add UPDATE policy for circle_members (role changes)
DROP POLICY IF EXISTS "Users can manage circle members update" ON circle_members;
CREATE POLICY "Users can manage circle members update" ON circle_members
  FOR UPDATE USING (
    -- Only owners can change roles (promote/demote)
    EXISTS (SELECT 1 FROM circles WHERE id = circle_id AND owner_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM circles WHERE id = circle_id AND owner_id = auth.uid())
  );

-- Recreate circle_events policies (they were dropped by CASCADE above)
DROP POLICY IF EXISTS "Circle members can view circle events" ON circle_events;
CREATE POLICY "Circle members can view circle events" ON circle_events
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM circle_members WHERE circle_id = circle_events.circle_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Circle members can insert circle events" ON circle_events;
CREATE POLICY "Circle members can insert circle events" ON circle_events
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM circle_members WHERE circle_id = circle_events.circle_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Circle members can update circle events" ON circle_events;
CREATE POLICY "Circle members can update circle events" ON circle_events
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM circle_members WHERE circle_id = circle_events.circle_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Circle members can delete circle events" ON circle_events;
CREATE POLICY "Circle members can delete circle events" ON circle_events
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM circle_members WHERE circle_id = circle_events.circle_id AND user_id = auth.uid())
  );
