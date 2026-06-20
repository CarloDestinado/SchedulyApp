-- Add parent_id for threaded replies
ALTER TABLE messages ADD COLUMN parent_id TEXT REFERENCES messages(id) ON DELETE CASCADE;

-- Message reactions table (heart, etc.)
CREATE TABLE message_reactions (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reaction TEXT NOT NULL DEFAULT 'heart',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(message_id, user_id)
);

CREATE INDEX idx_message_reactions_message ON message_reactions(message_id);

-- RLS
ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;

-- Circle members can read reactions
CREATE POLICY "Members can read reactions"
  ON message_reactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM messages m
      JOIN circle_members cm ON m.circle_id = cm.circle_id
      WHERE m.id = message_reactions.message_id AND cm.user_id = auth.uid()
    )
  );

-- Users can insert their own reactions
CREATE POLICY "Users can insert own reactions"
  ON message_reactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own reactions
CREATE POLICY "Users can delete own reactions"
  ON message_reactions FOR DELETE
  USING (auth.uid() = user_id);
