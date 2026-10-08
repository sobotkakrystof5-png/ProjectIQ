-- Migrace 071: Workspace — faktury, příjmy a výdaje, daňové nastavení (S06)
--
-- Peníze jako numeric(12,2) + currency. Měny se nikdy nesčítají dohromady
-- (AGENTS.md B3). Číslo vystavené faktury je unikátní v rámci účtu — jedno
-- IČO, jedna číselná řada napříč byznysy.

CREATE TABLE IF NOT EXISTS ws.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  business_id uuid NOT NULL,
  direction text NOT NULL DEFAULT 'issued' CHECK (direction IN ('issued', 'received')),
  customer_id uuid,
  job_id uuid,
  number text,
  counterparty jsonb NOT NULL DEFAULT '{}'::jsonb,
  issued_on date,
  due_on date,
  paid_on date,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'CZK' CHECK (currency ~ '^[A-Z]{3}$'),
  items jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(items) = 'array'),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued', 'paid', 'cancelled')),
  note text,
  pdf_path text,
  ai_extracted jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id),
  CHECK (due_on IS NULL OR issued_on IS NULL OR due_on >= issued_on),
  FOREIGN KEY (account_id, business_id) REFERENCES ws.businesses(account_id, id) ON DELETE CASCADE,
  FOREIGN KEY (account_id, customer_id) REFERENCES ws.customers(account_id, id) ON DELETE SET NULL (customer_id),
  FOREIGN KEY (account_id, job_id) REFERENCES ws.jobs(account_id, id) ON DELETE SET NULL (job_id)
);

CREATE INDEX IF NOT EXISTS invoices_account_business_idx ON ws.invoices (account_id, business_id);
CREATE INDEX IF NOT EXISTS invoices_due_idx ON ws.invoices (account_id, due_on) WHERE paid_on IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS invoices_number_uq ON ws.invoices (account_id, number) WHERE direction = 'issued' AND number IS NOT NULL;
SELECT ws.enable_account_rls('ws.invoices');
SELECT ws.add_touch_trigger('ws.invoices');

CREATE TABLE IF NOT EXISTS ws.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  business_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('income', 'expense')),
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'CZK' CHECK (currency ~ '^[A-Z]{3}$'),
  occurred_on date NOT NULL,
  category text,
  description text,
  payment_method text CHECK (payment_method IN ('cash', 'card', 'transfer', 'other')),
  invoice_id uuid,
  customer_id uuid,
  appointment_id uuid,
  job_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (account_id, business_id) REFERENCES ws.businesses(account_id, id) ON DELETE CASCADE,
  FOREIGN KEY (account_id, invoice_id) REFERENCES ws.invoices(account_id, id) ON DELETE SET NULL (invoice_id),
  FOREIGN KEY (account_id, customer_id) REFERENCES ws.customers(account_id, id) ON DELETE SET NULL (customer_id),
  FOREIGN KEY (account_id, appointment_id) REFERENCES ws.appointments(account_id, id) ON DELETE SET NULL (appointment_id),
  FOREIGN KEY (account_id, job_id) REFERENCES ws.jobs(account_id, id) ON DELETE SET NULL (job_id)
);

CREATE INDEX IF NOT EXISTS transactions_account_business_idx ON ws.transactions (account_id, business_id);
CREATE INDEX IF NOT EXISTS transactions_occurred_idx ON ws.transactions (account_id, occurred_on);
SELECT ws.enable_account_rls('ws.transactions');
SELECT ws.add_touch_trigger('ws.transactions');

-- Vstup pro odhad daní (jen odhad, S14). Jedno nastavení na účet = jedno IČO.
CREATE TABLE IF NOT EXISTS ws.tax_settings (
  account_id uuid PRIMARY KEY REFERENCES ws.accounts(id) ON DELETE CASCADE,
  mode text NOT NULL DEFAULT 'flat_expenses' CHECK (mode IN ('flat_expenses', 'real', 'flat_tax')),
  flat_rate smallint NOT NULL DEFAULT 60 CHECK (flat_rate IN (30, 40, 60, 80)),
  vat_payer boolean NOT NULL DEFAULT false,
  side_activity boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

SELECT ws.enable_account_rls('ws.tax_settings');
SELECT ws.add_touch_trigger('ws.tax_settings');
