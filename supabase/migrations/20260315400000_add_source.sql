-- Add source column to conversations table to track where conversations came from
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'internal';
CREATE INDEX IF NOT EXISTS idx_conversations_source ON conversations(source);
