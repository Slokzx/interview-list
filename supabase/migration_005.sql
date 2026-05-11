-- Add gmail_message_id to receipts for deduplication during Gmail sync
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS gmail_message_id TEXT UNIQUE;
