-- Custom research tables saved from Chat
CREATE TABLE IF NOT EXISTS custom_tables (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  description  TEXT,
  columns      TEXT[]      NOT NULL DEFAULT '{}',
  rows         JSONB       NOT NULL DEFAULT '[]',
  source_query TEXT,                         -- the user question that generated the table
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE custom_tables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own their custom tables"
  ON custom_tables FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
