-- Migration 003: add industry column
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS industry text;
