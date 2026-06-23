-- Oblast (sport/výživa, byznys, škola, vzdělání, …) na transakcích
ALTER TABLE finance_transactions
  ADD COLUMN IF NOT EXISTS area text;

-- Tabulka šablon pasivních/opakovaných transakcí v cash flow
CREATE TABLE IF NOT EXISTS recurring_cash_flow (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  type text NOT NULL,
  amount numeric NOT NULL,
  frequency text NOT NULL,  -- 'monthly' | 'annual'
  area text,
  category text NOT NULL,
  description text,
  created_at timestamptz DEFAULT now()
);

-- Odkaz generované transakce zpět na šablonu
ALTER TABLE finance_transactions
  ADD COLUMN IF NOT EXISTS source_recurring_cash_flow_id uuid
    REFERENCES recurring_cash_flow(id) ON DELETE CASCADE;

-- Zabrání duplicitnímu generování (šablona × perioda)
DO $$ BEGIN
  ALTER TABLE finance_transactions
    ADD CONSTRAINT ft_recurring_cf_period_unique
    UNIQUE (source_recurring_cash_flow_id, recurring_period);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Propojení byznys nákladu zpět na zdrojovou cash-flow transakci
ALTER TABLE costs
  ADD COLUMN IF NOT EXISTS source_finance_transaction_id uuid;
