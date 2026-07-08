-- plan_school_goals: cíle ve studiu (Hub modul Plány → Škola)
CREATE TABLE IF NOT EXISTS plan_school_goals (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  vision text,
  approach text,
  status text NOT NULL DEFAULT 'aktivni',
  target_date date,
  archived boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz
);

CREATE TABLE IF NOT EXISTS plan_school_goal_actions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  goal_id uuid NOT NULL REFERENCES plan_school_goals(id) ON DELETE CASCADE,
  content text NOT NULL,
  position integer NOT NULL DEFAULT 1 CHECK (position BETWEEN 1 AND 5),
  done boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
