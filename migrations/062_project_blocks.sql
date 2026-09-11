CREATE TABLE IF NOT EXISTS project_blocks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_template_id uuid REFERENCES block_templates(id) ON DELETE SET NULL,
  title text NOT NULL,
  color text,
  content text,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz
);

CREATE INDEX IF NOT EXISTS project_blocks_project_idx ON project_blocks (project_id, position);
