-- Migration 023: Weight logs pro sport modul
-- Sledování denní váhy uživatele

CREATE TABLE IF NOT EXISTS weight_logs (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid NULL,
  logged_date date NOT NULL,
  weight_kg   numeric(5,2) NOT NULL CHECK (weight_kg > 0 AND weight_kg < 500),
  created_at  timestamptz DEFAULT now()
);

-- Jeden záznam váhy per den (pro NULL user_id = single-admin)
CREATE UNIQUE INDEX IF NOT EXISTS weight_logs_null_user_date_uidx
  ON weight_logs (logged_date)
  WHERE user_id IS NULL;

CREATE INDEX IF NOT EXISTS weight_logs_user_date_idx
  ON weight_logs (user_id, logged_date DESC);
