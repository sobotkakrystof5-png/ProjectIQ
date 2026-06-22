-- Migration: Hub moduly — finance
-- finance_transactions: příjmy a výdaje s kategorií a datem
-- finance_goals: finanční cíle s progresem

CREATE TABLE IF NOT EXISTS finance_transactions (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid NULL,
  amount     numeric NOT NULL,
  type       text NOT NULL CHECK (type IN ('income', 'expense')),
  category   text NOT NULL,
  note       text,
  date       date NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS finance_transactions_user_date_idx ON finance_transactions (user_id, date DESC);
CREATE INDEX IF NOT EXISTS finance_transactions_type_idx ON finance_transactions (type);

CREATE TABLE IF NOT EXISTS finance_goals (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        uuid NULL,
  title          text NOT NULL,
  target_amount  numeric NOT NULL,
  current_amount numeric NOT NULL DEFAULT 0,
  deadline       date,
  color          text,
  created_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS finance_goals_user_idx ON finance_goals (user_id);

-- School (scraped data from LernSax / Beste Schule)
CREATE TABLE IF NOT EXISTS school_grades (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid NULL,
  subject     text NOT NULL,
  grade       numeric NOT NULL,
  grade_label text NOT NULL,
  weight      numeric NOT NULL DEFAULT 1,
  teacher     text,
  date        date,
  source      text NOT NULL CHECK (source IN ('lernsax', 'besteschule')),
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS school_grades_user_subject_idx ON school_grades (user_id, subject);
CREATE INDEX IF NOT EXISTS school_grades_user_date_idx ON school_grades (user_id, date DESC);

CREATE TABLE IF NOT EXISTS school_deadlines (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid NULL,
  title      text NOT NULL,
  subject    text,
  due_date   date NOT NULL,
  type       text NOT NULL CHECK (type IN ('test', 'homework', 'presentation')),
  done       boolean NOT NULL DEFAULT false,
  source     text NOT NULL CHECK (source IN ('lernsax', 'besteschule')),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS school_deadlines_user_due_idx ON school_deadlines (user_id, due_date);

CREATE TABLE IF NOT EXISTS school_messages (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid NULL,
  sender      text NOT NULL,
  subject     text NOT NULL,
  body        text NOT NULL,
  read        boolean NOT NULL DEFAULT false,
  received_at timestamptz NOT NULL,
  source      text NOT NULL CHECK (source IN ('lernsax', 'besteschule')),
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS school_messages_user_received_idx ON school_messages (user_id, received_at DESC);
CREATE INDEX IF NOT EXISTS school_messages_user_read_idx ON school_messages (user_id, read);

CREATE TABLE IF NOT EXISTS school_sync_log (
  id        uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id   uuid NULL,
  source    text NOT NULL CHECK (source IN ('lernsax', 'besteschule')),
  synced_at timestamptz DEFAULT now(),
  status    text NOT NULL CHECK (status IN ('ok', 'error')),
  error_msg text
);

CREATE INDEX IF NOT EXISTS school_sync_log_user_source_idx ON school_sync_log (user_id, source, synced_at DESC);

-- Sport
CREATE TABLE IF NOT EXISTS nutrition_logs (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid NULL,
  logged_date date NOT NULL,
  food_name   text NOT NULL,
  food_id     text,
  calories    numeric NOT NULL,
  protein_g   numeric NOT NULL DEFAULT 0,
  carbs_g     numeric NOT NULL DEFAULT 0,
  fat_g       numeric NOT NULL DEFAULT 0,
  fiber_g     numeric NOT NULL DEFAULT 0,
  amount_g    numeric NOT NULL DEFAULT 100,
  meal_type   text NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS nutrition_logs_user_date_idx ON nutrition_logs (user_id, logged_date DESC);
CREATE INDEX IF NOT EXISTS nutrition_logs_user_meal_idx ON nutrition_logs (user_id, logged_date, meal_type);

CREATE TABLE IF NOT EXISTS workout_logs (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        uuid NULL,
  logged_date    date NOT NULL,
  title          text NOT NULL,
  muscle_groups  text[] NOT NULL DEFAULT '{}',
  duration_min   integer,
  sets           integer,
  reps           integer,
  weight_kg      numeric,
  notes          text,
  created_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workout_logs_user_date_idx ON workout_logs (user_id, logged_date DESC);

CREATE TABLE IF NOT EXISTS health_scores (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        uuid NULL,
  scored_date    date NOT NULL,
  score          integer NOT NULL CHECK (score >= 0 AND score <= 100),
  protein_score  integer,
  carbs_score    integer,
  fat_score      integer,
  activity_score integer,
  created_at     timestamptz DEFAULT now(),
  UNIQUE (user_id, scored_date)
);

CREATE INDEX IF NOT EXISTS health_scores_user_date_idx ON health_scores (user_id, scored_date DESC);
