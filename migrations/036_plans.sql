-- plans: nápady na budoucí projekty ve fázi rozhodování/analýzy (Hub modul Plány)
CREATE TABLE IF NOT EXISTS plans (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'jine',
  status text NOT NULL DEFAULT 'napad',
  potential_value numeric,
  effort_score integer CHECK (effort_score IS NULL OR (effort_score BETWEEN 1 AND 10)),
  risk_score integer CHECK (risk_score IS NULL OR (risk_score BETWEEN 1 AND 10)),
  next_step text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz
);
