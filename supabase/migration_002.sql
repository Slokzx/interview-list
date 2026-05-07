-- Migration 002: add recruiter_email column
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS recruiter_email text;
