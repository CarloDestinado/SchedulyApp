-- Conversation message reactions table (for DM reactions)
CREATE TABLE conversation_message_reactions (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES conversation_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reaction TEXT NOT NULL DEFAULT '❤️',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(message_id, user_id)
);

CREATE INDEX idx_cmr_message ON conversation_message_reactions(message_id);

ALTER TABLE conversation_message_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can read conversation reactions"
  ON conversation_message_reactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM conversation_participants
      WHERE conversation_id = (
        SELECT conversation_id FROM conversation_messages
        WHERE id = conversation_message_reactions.message_id
      )
      AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own conversation reactions"
  ON conversation_message_reactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own conversation reactions"
  ON conversation_message_reactions FOR DELETE
  USING (auth.uid() = user_id);
