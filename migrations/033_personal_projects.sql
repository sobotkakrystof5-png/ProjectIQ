-- personal_projects: Osobní projekty ve vývoji (sekce Projekty)
CREATE TABLE IF NOT EXISTS personal_projects (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  segment text NOT NULL,
  problem text NOT NULL,
  description text,
  tech_stack text,
  github_url text,
  live_url text,
  monetization boolean DEFAULT false,
  phase text DEFAULT 'idea',
  progress integer DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  currency text DEFAULT 'CZK',
  planned_investment numeric,
  notes text,
  archived boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz
);

-- personal_project_improvements: Nápady na zlepšení
CREATE TABLE IF NOT EXISTS personal_project_improvements (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  personal_project_id uuid NOT NULL REFERENCES personal_projects(id) ON DELETE CASCADE,
  content text NOT NULL,
  status text DEFAULT 'idea',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz
);

-- personal_project_changelog: Audit log změn
CREATE TABLE IF NOT EXISTS personal_project_changelog (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  personal_project_id uuid NOT NULL REFERENCES personal_projects(id) ON DELETE CASCADE,
  change_date date DEFAULT CURRENT_DATE,
  change_type text NOT NULL,
  description text NOT NULL,
  progress_from integer,
  progress_to integer,
  created_at timestamptz DEFAULT now()
);
