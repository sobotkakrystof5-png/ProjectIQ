-- Rozlišení zálohy vs. finální platby v rámci jednoho projektu.
-- DEFAULT false = finální platba (nebo starý záznam bez přiznaku).

ALTER TABLE finance_transactions
  ADD COLUMN IF NOT EXISTS deposit_transaction boolean NOT NULL DEFAULT false;
