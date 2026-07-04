-- Migration: Create circle_invitations table for admin-initiated invitations
-- Users receive invitations and can Accept (auto-join) or Decline

-- 1. Create the invitations table
CREATE TABLE IF NOT EXISTS circle_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id TEXT NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  invited_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invited_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(circle_id, invited_user_id)
);

-- 2. Enable RLS
ALTER TABLE circle_invitations ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies

-- SELECT: invited user can see their own invitations;
-- circle admins/owner can see invitations for their circle
CREATE POLICY "Users can view their own invitations" ON circle_invitations
  FOR SELECT USING (
    auth.uid() = invited_user_id
    OR
    EXISTS (
      SELECT 1 FROM circle_members cm
      WHERE cm.circle_id = circle_invitations.circle_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('admin', 'owner')
    )
  );

-- INSERT: circle admins/owner can send invitations
CREATE POLICY "Admins can send invitations" ON circle_invitations
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM circle_members cm
      WHERE cm.circle_id = circle_invitations.circle_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('admin', 'owner')
    )
  );

-- UPDATE: invited user can accept/decline (status only);
-- circle admins/owner can cancel (set to 'declined')
CREATE POLICY "Users can respond to their invitations" ON circle_invitations
  FOR UPDATE USING (
    auth.uid() = invited_user_id
    OR
    EXISTS (
      SELECT 1 FROM circle_members cm
      WHERE cm.circle_id = circle_invitations.circle_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('admin', 'owner')
    )
  )
  WITH CHECK (
    -- Invited user can only change status
    (auth.uid() = invited_user_id AND status IN ('accepted', 'declined'))
    OR
    -- Admin can set to 'declined' (cancel)
    (
      EXISTS (
        SELECT 1 FROM circle_members cm
        WHERE cm.circle_id = circle_invitations.circle_id
          AND cm.user_id = auth.uid()
          AND cm.role IN ('admin', 'owner')
      )
      AND status = 'declined'
    )
  );

-- DELETE: only circle admins/owner can delete
CREATE POLICY "Admins can delete invitations" ON circle_invitations
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM circle_members cm
      WHERE cm.circle_id = circle_invitations.circle_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('admin', 'owner')
    )
  );
