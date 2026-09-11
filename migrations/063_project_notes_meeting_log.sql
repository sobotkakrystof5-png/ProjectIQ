-- Přerod project_notes z pojmenovaných sekcí na rychlý chronologický log
-- schůzek/hovorů: kdo poznámku zapsal + snapshot aktuálního progressu zakázky.
ALTER TABLE project_notes
  ADD COLUMN IF NOT EXISTS author text NOT NULL DEFAULT 'Kryštof Sobotka',
  ADD COLUMN IF NOT EXISTS progress_snapshot integer;

UPDATE project_notes pn
SET progress_snapshot = p.progress
FROM projects p
WHERE pn.project_id = p.id AND pn.progress_snapshot IS NULL;

ALTER TABLE project_notes DROP COLUMN IF EXISTS section;
