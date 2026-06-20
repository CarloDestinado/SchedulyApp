-- Add parent_id for threaded replies
ALTER TABLE event_comments ADD COLUMN parent_id TEXT REFERENCES event_comments(id) ON DELETE CASCADE;

-- Comment likes table
CREATE TABLE comment_likes (
  id TEXT PRIMARY KEY,
  comment_id TEXT NOT NULL REFERENCES event_comments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(comment_id, user_id)
);

CREATE INDEX idx_comment_likes_comment ON comment_likes(comment_id);

-- RLS
ALTER TABLE comment_likes ENABLE ROW LEVEL SECURITY;

-- Circle members can read likes
CREATE POLICY "Members can read likes"
  ON comment_likes FOR SELECT
  USING (
    is_circle_member(
      (SELECT ce.circle_id 
       FROM event_comments ec 
       JOIN circle_events ce ON ec.circle_event_id = ce.id 
       WHERE ec.id = comment_likes.comment_id),
      auth.uid()
    )
  );

-- Users can insert/delete their own likes
CREATE POLICY "Users can insert own likes"
  ON comment_likes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own likes"
  ON comment_likes FOR DELETE
  USING (auth.uid() = user_id);
