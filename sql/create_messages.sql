-- Messages table for circle-level real-time chat
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  circle_id TEXT NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Circle members can view messages
CREATE POLICY "Circle members can view messages" ON messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM circle_members WHERE circle_id = messages.circle_id AND user_id = auth.uid()
    )
  );

-- Circle members can insert their own messages
CREATE POLICY "Users can insert their own messages" ON messages
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM circle_members WHERE circle_id = messages.circle_id AND user_id = auth.uid()
    )
  );

-- Users can delete their own messages
CREATE POLICY "Users can delete their own messages" ON messages
  FOR DELETE USING (auth.uid() = user_id);

-- Index for fast message fetching per circle
CREATE INDEX idx_messages_circle_id ON messages(circle_id);
CREATE INDEX idx_messages_created_at ON messages(circle_id, created_at);
