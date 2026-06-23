-- recurring_period: 'YYYY-MM' for monthly costs, 'YYYY' for annual costs
ALTER TABLE finance_transactions
  ADD COLUMN IF NOT EXISTS recurring_period text;

-- Prevent duplicate recurring inserts per cost per period
DO $$ BEGIN
  ALTER TABLE finance_transactions
    ADD CONSTRAINT finance_transactions_cost_period_unique
    UNIQUE (source_cost_id, recurring_period);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
