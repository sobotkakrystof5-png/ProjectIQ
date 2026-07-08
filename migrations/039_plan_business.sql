-- plan_businesses: strategické plánování (Hub modul Plány → Byznys, funnel krok 2)
CREATE TABLE IF NOT EXISTS plan_businesses (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  source_project_id uuid REFERENCES plan_projects(id) ON DELETE SET NULL,
  title text NOT NULL,
  goals text,
  current_situation text,
  growth_goals text,
  vision_10y text,
  budget numeric,
  currency text DEFAULT 'CZK',
  status text NOT NULL DEFAULT 'planovani',
  exported_startup_id uuid REFERENCES startup_projects(id) ON DELETE SET NULL,
  archived boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz
);

CREATE TABLE IF NOT EXISTS plan_business_phases (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES plan_businesses(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'planovana',
  position integer DEFAULT 1,
  target_date date,
  created_at timestamptz DEFAULT now()
);
