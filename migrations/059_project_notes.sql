CREATE TABLE IF NOT EXISTS project_notes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  section text NOT NULL,
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_notes_project_idx ON project_notes (project_id, section, created_at DESC);
