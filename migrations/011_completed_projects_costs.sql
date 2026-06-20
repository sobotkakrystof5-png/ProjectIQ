CREATE TABLE IF NOT EXISTS completed_projects (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  client_name text,
  company text,
  completed_at date NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  difficulty integer NOT NULL DEFAULT 5 CHECK (difficulty >= 1 AND difficulty <= 10),
  time_invested numeric,
  notes text,
  project_type text NOT NULL DEFAULT 'client',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS costs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  cost_type text NOT NULL,
  description text,
  created_at timestamptz DEFAULT now()
);
