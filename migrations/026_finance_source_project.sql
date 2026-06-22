-- Sledování původu transakce — odkaz na projekt, ze kterého transakce vznikla.
-- Zabraňuje duplicitám při opakovaném spuštění migrace.

ALTER TABLE finance_transactions
  ADD COLUMN IF NOT EXISTS source_project_id uuid REFERENCES projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS finance_transactions_source_project_idx
  ON finance_transactions (source_project_id);

-- Jednorázová migrace: všechny placené zakázky (paid = true) → income transakce.
-- Zakázky, které už mají odpovídající transakci, se přeskočí.
INSERT INTO finance_transactions (amount, type, category, note, date, user_id, source_project_id)
SELECT
  price::numeric,
  'income',
  'zakázka',
  client_name || CASE
    WHEN description IS NOT NULL AND description <> '' THEN ' — ' || description
    ELSE ''
  END,
  COALESCE(updated_at::date, created_at::date),
  NULL,
  id
FROM projects
WHERE paid = true
  AND price IS NOT NULL
  AND price > 0
  AND id NOT IN (
    SELECT source_project_id
    FROM finance_transactions
    WHERE source_project_id IS NOT NULL
  );
