-- startup_projects: Osobní startup projekty v hub/byznys/startup
CREATE TABLE IF NOT EXISTS startup_projects (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  segment text NOT NULL,
  problem text NOT NULL,
  monetization boolean DEFAULT false,
  plan text,
  know_how text,
  notes text,
  live_url text,
  phase text DEFAULT 'idea',
  progress integer DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  currency text DEFAULT 'CZK',
  planned_investment numeric,
  total_users integer,
  paying_users_pct numeric,
  monetization_model text DEFAULT 'saas',
  monthly_price numeric,
  annual_price numeric,
  annual_discount_pct numeric DEFAULT 0,
  onetime_price numeric,
  archived boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz
);

-- startup_improvements: Nápady na zlepšení
CREATE TABLE IF NOT EXISTS startup_improvements (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  startup_project_id uuid NOT NULL REFERENCES startup_projects(id) ON DELETE CASCADE,
  content text NOT NULL,
  status text DEFAULT 'idea',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz
);

-- startup_changelog: Audit log změn projektu
CREATE TABLE IF NOT EXISTS startup_changelog (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  startup_project_id uuid NOT NULL REFERENCES startup_projects(id) ON DELETE CASCADE,
  change_date date DEFAULT CURRENT_DATE,
  change_type text NOT NULL,
  description text NOT NULL,
  progress_from integer,
  progress_to integer,
  created_at timestamptz DEFAULT now()
);
