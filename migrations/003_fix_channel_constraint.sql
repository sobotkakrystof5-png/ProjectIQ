-- Migration 003: Remove channel CHECK constraint to allow free-text values
-- (needed for the 'other' channel option which stores user-specified text)
-- Run in Neon SQL Editor AFTER 002_calendar_events.sql

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'consultation_slots_channel_check'
      AND conrelid = 'consultation_slots'::regclass
  ) THEN
    ALTER TABLE consultation_slots DROP CONSTRAINT consultation_slots_channel_check;
  END IF;
END
$$;
