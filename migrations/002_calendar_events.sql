-- Migration 002: Admin calendar events + global double-booking prevention
-- Run in Neon SQL Editor

-- ─── 1. Admin manual calendar events ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS calendar_events (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  title       text        NOT NULL,
  description text,
  starts_at   timestamptz NOT NULL,
  ends_at     timestamptz NOT NULL,
  event_type  text        NOT NULL DEFAULT 'manual'
                          CHECK (event_type IN ('manual', 'block')),
  created_at  timestamptz DEFAULT now()
);

-- ─── 2. Fix double-booking: make scheduled_at globally unique ─────────────────
--
-- The original constraint (migration 001) was per-project, which allowed two
-- different clients from different projects to book the same slot. Since there
-- is one admin, the slot must be unique across ALL projects.

DO $$
BEGIN
  -- Drop old per-project constraint if it exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'consultation_slots_project_id_scheduled_at_key'
  ) THEN
    ALTER TABLE consultation_slots
      DROP CONSTRAINT consultation_slots_project_id_scheduled_at_key;
  END IF;

  -- Add global uniqueness constraint if not already present
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'consultation_slots_scheduled_at_key'
  ) THEN
    ALTER TABLE consultation_slots
      ADD CONSTRAINT consultation_slots_scheduled_at_key UNIQUE (scheduled_at);
  END IF;
END
$$;
