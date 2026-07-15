-- Migration 033: fix calendar overlap guard error code
--
-- The trigger added in 008_calendar_overlap_guard.sql raises a plain
-- RAISE EXCEPTION without USING ERRCODE, which defaults to Postgres' generic
-- 'P0001'. app/calendar-actions.ts and app/api/public/booking/route.ts both
-- catch err.code === '23P01' (exclusion_violation) to show a friendly
-- "termín se překrývá" message — that catch never matched, so the raw
-- exception propagated instead. This re-creates the function with the
-- correct error code. CREATE OR REPLACE is idempotent.

CREATE OR REPLACE FUNCTION check_calendar_overlap()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM calendar_events
    WHERE id != NEW.id
      AND starts_at < NEW.ends_at
      AND ends_at > NEW.starts_at
  ) THEN
    RAISE EXCEPTION 'Tento termín se překrývá s jinou událostí v kalendáři.'
      USING ERRCODE = '23P01';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
