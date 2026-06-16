-- Migration 005: Add project_url column for the live Vercel deployment link
-- Idempotent — safe to run even if already applied. Run in Neon SQL Editor.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_url text;
