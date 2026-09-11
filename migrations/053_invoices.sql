-- Migration 053: archiv faktur
--
-- Faktura je doklad, ne příjem. Zdanitelný příjem vzniká až vyplněním
-- `paid_on` (daňová evidence = hotovostní princip) — teprve tehdy smí
-- vzniknout příjmová transakce v ledgeru. Faktura bez `paid_on` je
-- pohledávka a do daňového základu nevstupuje.
--
-- `finance_transaction_id` drží vazbu na tu jedinou transakci, kterou
-- faktura vytvořila. Slouží jako pojistka proti dvojímu započtení příjmu:
-- jeden příjem vstupuje do ledgeru právě jednou.
--
-- PDF se ukládá přímo do Neonu jako bytea (žádný Blob, žádné S3). Limit
-- 5 MB se vynucuje v aplikaci — neonový HTTP driver není na velké
-- payloady stavěný.
--
-- `project_id` je volitelný: faktura může existovat i bez zakázky
-- (zadaná rovnou ve Financích). Smazání zakázky fakturu nemaže, jen
-- rozváže vazbu — doklad musí přežít úklid v zakázkách.

CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  client_name text,
  client_ico text,
  client_dic text,
  issued_on date NOT NULL,
  due_on date,
  paid_on date,
  amount numeric NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'CZK',
  note text,
  pdf_data bytea,
  pdf_filename text,
  pdf_size integer,
  ai_extracted jsonb,
  finance_transaction_id uuid REFERENCES finance_transactions(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS invoices_number_key ON invoices (invoice_number);
CREATE INDEX IF NOT EXISTS invoices_project_idx ON invoices (project_id);
CREATE INDEX IF NOT EXISTS invoices_paid_on_idx ON invoices (paid_on);
