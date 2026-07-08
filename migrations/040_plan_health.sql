-- plan_health_goals: sportovní a zdravotní cíle (Hub modul Plány → Sport)
CREATE TABLE IF NOT EXISTS plan_health_goals (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  description text,
  target_value numeric,
  current_value numeric,
  unit text,
  status text NOT NULL DEFAULT 'aktivni',
  target_date date,
  archived boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz
);

CREATE TABLE IF NOT EXISTS plan_health_goal_actions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  goal_id uuid NOT NULL REFERENCES plan_health_goals(id) ON DELETE CASCADE,
  content text NOT NULL,
  position integer NOT NULL DEFAULT 1 CHECK (position BETWEEN 1 AND 5),
  done boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS plan_health_goal_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  goal_id uuid NOT NULL REFERENCES plan_health_goals(id) ON DELETE CASCADE,
  log_date date NOT NULL DEFAULT CURRENT_DATE,
  value numeric NOT NULL,
  note text,
  created_at timestamptz DEFAULT now()
);
