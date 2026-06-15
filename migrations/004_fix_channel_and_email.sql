-- Migration 004: Fix channel constraint + ensure client_email column exists
-- Idempotent — safe to run even if 002/003 were already applied.
-- Run in Neon SQL Editor.

DO $$
BEGIN
  -- 1. Drop the old CHECK constraint (whatsapp/teams/meet/phone only) if present.
  --    This unblocks the 'other' channel option added in the UI.
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'consultation_slots_channel_check'
      AND conrelid = 'consultation_slots'::regclass
  ) THEN
    ALTER TABLE consultation_slots DROP CONSTRAINT consultation_slots_channel_check;
  END IF;
END
$$;

-- 2. Ensure client_email column exists (in case migration 001 was skipped or
--    the table was created manually without this column).
ALTER TABLE consultation_slots ADD COLUMN IF NOT EXISTS client_email text;
