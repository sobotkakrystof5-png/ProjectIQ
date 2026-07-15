-- Migration 034: cross-table overlap guard (calendar_events <-> consultation_slots)
--
-- calendar_events has a same-table overlap trigger (008/033) and
-- consultation_slots has a global UNIQUE on scheduled_at (002), but nothing
-- enforces the *cross-table* case. app/api/public/booking/route.ts and
-- app/portal-actions.ts (submitConsultation) both worked around this with a
-- SELECT-then-INSERT check against the other table — a TOCTOU race, since
-- two concurrent requests can each pass the SELECT before either INSERT
-- commits. Move the check into triggers so it runs atomically with the write,
-- and raise the same ERRCODE 23P01 the app already catches for calendar
-- overlaps.

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

  IF EXISTS (
    SELECT 1 FROM consultation_slots
    WHERE scheduled_at >= NEW.starts_at
      AND scheduled_at < NEW.ends_at
  ) THEN
    RAISE EXCEPTION 'Tento termín se překrývá s jinou konzultací.'
      USING ERRCODE = '23P01';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION check_consultation_overlap()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM calendar_events
    WHERE starts_at <= NEW.scheduled_at
      AND ends_at > NEW.scheduled_at
  ) THEN
    RAISE EXCEPTION 'Tento termín se překrývá s jinou událostí v kalendáři.'
      USING ERRCODE = '23P01';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'consultation_slots_overlap_check'
  ) THEN
    CREATE TRIGGER consultation_slots_overlap_check
    BEFORE INSERT ON consultation_slots
    FOR EACH ROW
    EXECUTE FUNCTION check_consultation_overlap();
  END IF;
END
$$;
