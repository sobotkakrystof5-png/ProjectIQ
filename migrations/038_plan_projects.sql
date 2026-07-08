-- plan_projects: validace nových nápadů (Hub modul Plány → Projekty, funnel krok 1)
CREATE TABLE IF NOT EXISTS plan_projects (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  description text,
  purpose_meaning text,
  problem_solved text,
  willingness_to_pay text,
  potential_notes text,
  progress_notes text,
  sentiment_pct integer CHECK (sentiment_pct BETWEEN 0 AND 100),
  planned_investment numeric,
  expected_return numeric,
  currency text DEFAULT 'CZK',
  status text NOT NULL DEFAULT 'validace',
  archived boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz
);

CREATE TABLE IF NOT EXISTS plan_project_actions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES plan_projects(id) ON DELETE CASCADE,
  content text NOT NULL,
  position integer NOT NULL DEFAULT 1 CHECK (position BETWEEN 1 AND 5),
  done boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Data migrace ze staré `plans` (byznys nápady) — idempotentní guard přes NOT EXISTS,
-- žádné mazání staré tabulky (viz migrace 042 pro pozdější archivaci)
INSERT INTO plan_projects (title, description, potential_notes, planned_investment, status, created_at)
SELECT p.title, p.description, p.notes, p.potential_value,
  CASE p.status WHEN 'rozhodnuto_ano' THEN 'schvaleno' WHEN 'rozhodnuto_ne' THEN 'zamitnuto' ELSE 'validace' END,
  p.created_at
FROM plans p
WHERE NOT EXISTS (
  SELECT 1 FROM plan_projects pp WHERE pp.title = p.title AND pp.created_at = p.created_at
);
