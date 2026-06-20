-- Event Comments table for circle event discussions
CREATE TABLE event_comments (
  id TEXT PRIMARY KEY,
  circle_event_id TEXT REFERENCES circle_events(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_event_comments_event ON event_comments(circle_event_id);

-- Enable Row Level Security
ALTER TABLE event_comments ENABLE ROW LEVEL SECURITY;

-- Members of the circle that owns the event can read comments
CREATE POLICY "Circle members can read comments"
  ON event_comments FOR SELECT
  USING (
    is_circle_member(
      (SELECT circle_id FROM circle_events WHERE id = event_comments.circle_event_id),
      auth.uid()
    )
  );

-- Authenticated circle members can insert comments
CREATE POLICY "Circle members can insert comments"
  ON event_comments FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND is_circle_member(
      (SELECT circle_id FROM circle_events WHERE id = circle_event_id),
      auth.uid()
    )
  );

-- Users can only delete their own comments
CREATE POLICY "Users can delete own comments"
  ON event_comments FOR DELETE
  USING (auth.uid() = user_id);
