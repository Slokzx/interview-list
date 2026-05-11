-- Interview research entries
CREATE TABLE IF NOT EXISTS research (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  company          TEXT,
  role             TEXT,
  interview_round  TEXT DEFAULT 'General',
  topics           TEXT,
  notes            TEXT,
  status           TEXT DEFAULT 'Not Started',
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE research ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own research" ON research;
CREATE POLICY "Users manage own research" ON research
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Interview expense receipts
CREATE TABLE IF NOT EXISTS receipts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  company      TEXT,
  description  TEXT,
  amount       DECIMAL(10, 2),
  category     TEXT DEFAULT 'Other',
  date         DATE,
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own receipts" ON receipts;
CREATE POLICY "Users manage own receipts" ON receipts
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
