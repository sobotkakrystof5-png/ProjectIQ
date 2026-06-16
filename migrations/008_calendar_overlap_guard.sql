-- Migration 008: DB-level double-booking guard for calendar_events
-- Run in Neon SQL Editor
--
-- Until now, only consultation_slots had a global UNIQUE constraint preventing
-- double-booking. calendar_events (admin blocks + vizeon.cz bookings) had no
-- such guard, so two overlapping events (e.g. a vizeon booking landing inside
-- an admin "block", or two vizeon bookings at the same time) could silently
-- coexist. This adds a trigger-based guard to prevent overlapping ranges.

CREATE OR REPLACE FUNCTION check_calendar_overlap()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM calendar_events
    WHERE id != NEW.id
      AND starts_at < NEW.ends_at
      AND ends_at > NEW.starts_at
  ) THEN
    RAISE EXCEPTION 'Tento termín se překrývá s jinou událostí v kalendáři.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'calendar_events_overlap_check'
  ) THEN
    CREATE TRIGGER calendar_events_overlap_check
    BEFORE INSERT OR UPDATE ON calendar_events
    FOR EACH ROW
    EXECUTE FUNCTION check_calendar_overlap();
  END IF;
END
$$;
