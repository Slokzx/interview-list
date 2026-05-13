-- Store the Gmail API query string used to populate a custom table
-- (source_query holds the user's natural-language question;
--  gmail_query holds the actual Gmail search string for re-syncing)
ALTER TABLE custom_tables ADD COLUMN IF NOT EXISTS gmail_query TEXT;
