-- plan_finance_goals / plan_savings_snapshots / plan_wishlist_items:
-- Finance cíle (Hub modul Plány → Finance, 4 taby: Cíle / Úspory / Investice / Přání)
CREATE TABLE IF NOT EXISTS plan_finance_goals (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  target_amount numeric NOT NULL,
  period text,
  target_date date,
  current_amount numeric DEFAULT 0,
  notes text,
  archived boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz
);

CREATE TABLE IF NOT EXISTS plan_savings_snapshots (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  amount numeric NOT NULL,
  note text,
  created_at timestamptz DEFAULT now()
);

-- Sdílená tabulka pro Investice i Přání — liší se jen item_type
CREATE TABLE IF NOT EXISTS plan_wishlist_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  item_type text NOT NULL,
  title text NOT NULL,
  target_amount numeric NOT NULL,
  saved_amount numeric DEFAULT 0,
  purpose text,
  expected_return_pct numeric,
  status text NOT NULL DEFAULT 'aktivni',
  archived boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz
);
