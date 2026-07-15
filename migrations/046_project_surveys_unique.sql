-- Migration 036: enforce one survey per completed project at the DB level
--
-- submitSurvey used a SELECT-then-INSERT existence check as its only guard
-- against duplicate submissions ("existence check serves as rate limit"),
-- with no constraint backing it up — a TOCTOU race, same class of bug fixed
-- for consultation_slots in migration 002. Add a UNIQUE constraint so a
-- concurrent double-submit is rejected by Postgres (23505) instead of
-- silently racing.

-- Defensive cleanup in case a prior race already produced duplicates
-- (the ADD CONSTRAINT below would fail otherwise): keep the earliest survey
-- per completed project.
DELETE FROM project_surveys a
USING project_surveys b
WHERE a.completed_project_id = b.completed_project_id
  AND (a.created_at, a.id) > (b.created_at, b.id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'project_surveys_completed_project_id_key'
  ) THEN
    ALTER TABLE project_surveys
      ADD CONSTRAINT project_surveys_completed_project_id_key UNIQUE (completed_project_id);
  END IF;
END
$$;
