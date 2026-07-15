-- Migration 037: track which project a completed_projects row came from
--
-- markProjectAsCompleted guarded against double-completion with
-- `WHERE title = ... AND client_name = ...`, which is scoped to the string
-- fields, not to the source project — two different projects for the same
-- client with an empty description (title falls back to client_name)
-- collide as "duplicate" even though they're unrelated zakázky. Add an
-- explicit source_project_id so the duplicate check (and any future lookup)
-- can be scoped to the actual project.

ALTER TABLE completed_projects
  ADD COLUMN IF NOT EXISTS source_project_id uuid REFERENCES projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS completed_projects_source_project_idx
  ON completed_projects (source_project_id);
