-- Migration 016: client satisfaction surveys (sekce Hodnocení)
-- Run in Neon SQL Editor

-- Each completed project gets a unique public survey token + remembers the client email
ALTER TABLE completed_projects ADD COLUMN IF NOT EXISTS survey_token uuid DEFAULT gen_random_uuid();
ALTER TABLE completed_projects ADD COLUMN IF NOT EXISTS client_email text;

-- Backfill: any existing rows that somehow have no token get one
UPDATE completed_projects SET survey_token = gen_random_uuid() WHERE survey_token IS NULL;

CREATE TABLE IF NOT EXISTS project_surveys (
  id                   uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  completed_project_id uuid        NOT NULL REFERENCES completed_projects(id) ON DELETE CASCADE,
  rating_cooperation   integer     NOT NULL CHECK (rating_cooperation   BETWEEN 1 AND 5),
  rating_speed         integer     NOT NULL CHECK (rating_speed         BETWEEN 1 AND 5),
  rating_design        integer     NOT NULL CHECK (rating_design        BETWEEN 1 AND 5),
  rating_functionality integer     NOT NULL CHECK (rating_functionality BETWEEN 1 AND 5),
  rating_reliability   integer     NOT NULL CHECK (rating_reliability   BETWEEN 1 AND 5),
  rating_flexibility   integer     NOT NULL CHECK (rating_flexibility   BETWEEN 1 AND 5),
  reference_text       text,
  consent              boolean     NOT NULL DEFAULT false,
  created_at           timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_surveys_completed_project
  ON project_surveys (completed_project_id);
