-- 1. Ranní připomínka ve den termínu (school_deadlines_manual)
ALTER TABLE school_deadlines_manual
  ADD COLUMN IF NOT EXISTS reminder_day_of_sent boolean NOT NULL DEFAULT false;

-- 2. Sledování původu transakce — dokončený projekt a náklady
ALTER TABLE finance_transactions
  ADD COLUMN IF NOT EXISTS source_completed_project_id uuid REFERENCES completed_projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS finance_transactions_source_completed_idx
  ON finance_transactions (source_completed_project_id);

ALTER TABLE finance_transactions
  ADD COLUMN IF NOT EXISTS source_cost_id uuid REFERENCES costs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS finance_transactions_source_cost_idx
  ON finance_transactions (source_cost_id);

-- 3. Jednorázová migrace: completed_projects → income
INSERT INTO finance_transactions (amount, type, category, note, date, user_id, source_completed_project_id)
SELECT
  amount::numeric,
  'income',
  'dokončený projekt',
  TRIM(title || COALESCE(' — ' || client_name, '')),
  completed_at,
  NULL,
  id
FROM completed_projects
WHERE amount > 0
  AND id NOT IN (
    SELECT source_completed_project_id
    FROM finance_transactions
    WHERE source_completed_project_id IS NOT NULL
  );

-- 4. Jednorázová migrace: jednorázové náklady → expense
INSERT INTO finance_transactions (amount, type, category, note, date, user_id, source_cost_id)
SELECT
  amount::numeric,
  'expense',
  'náklady',
  name,
  created_at::date,
  NULL,
  id
FROM costs
WHERE cost_type = 'one_time'
  AND id NOT IN (
    SELECT source_cost_id
    FROM finance_transactions
    WHERE source_cost_id IS NOT NULL
  );
