-- Migrace 117: koncepty faktur a pravidelné faktury (R-117)
--
-- Faktura dřív vznikala jen ručně a hned s číslem. Teď se může **připravit
-- sama** — když je zakázka hotová, když ji připraví asistent, když ji
-- uložíte rozepsanou, nebo jednou měsíčně z pravidelné faktury — a čeká
-- v Fakturách › Ke schválení. Číslo z řady dostane až kliknutím
-- „Schválit a poslat", takže zahozený koncept v řadě nenechá díru (R-098).
--
-- Koncept **není doklad**: nemá číslo, nejde do ledgeru, nic neodchází.
-- Proto žije ve vlastní tabulce, ne v `invoices` — trigger neměnnosti
-- (migrace 107) a unikátnost čísel se ho vůbec netýkají.
--
-- Aditivní a idempotentní. Starý build adminu o nových tabulkách neví
-- a nový sloupec `invoices.client_email` je nullable.

-- ─── 1. Kam faktura odešla ───────────────────────────────────────────────────
-- Adresa odběratele na dokladu. Není to náležitost dokladu (PDF ji netiskne),
-- trigger `admin_invoice_locked` ji proto nehlídá a smí se doplnit i později.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS client_email text;

-- ─── 2. Pravidelné faktury ───────────────────────────────────────────────────
-- Šablona, ze které denní cron jednou za měsíc připraví koncept. Nic se
-- neposílá samo — koncept čeká na schválení jako každý jiný.
CREATE TABLE IF NOT EXISTS invoice_recurring (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label         text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 160),
  project_id    uuid REFERENCES projects(id) ON DELETE SET NULL,
  -- {name, address, ico, dic} — stejný tvar jako odběratel ve formuláři.
  counterparty  jsonb NOT NULL,
  client_email  text NOT NULL DEFAULT '',
  -- [{description, quantity, unitPrice, vatRate}]
  items         jsonb NOT NULL,
  currency      text NOT NULL DEFAULT 'CZK' CHECK (currency IN ('CZK', 'EUR')),
  due_days      integer NOT NULL DEFAULT 14 CHECK (due_days BETWEEN 0 AND 90),
  -- Den v měsíci, od kterého se koncept připraví. Jen 1–28, aby existoval
  -- v každém měsíci včetně února.
  day_of_month  integer NOT NULL DEFAULT 1 CHECK (day_of_month BETWEEN 1 AND 28),
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ─── 3. Koncepty ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoice_drafts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Kdo koncept připravil: hotová zakázka, ruční uložení, asistent, nebo
  -- pravidelná faktura.
  source        text NOT NULL CHECK (source IN ('project_done', 'manual', 'assistant', 'recurring')),
  project_id    uuid REFERENCES projects(id) ON DELETE CASCADE,
  recurring_id  uuid REFERENCES invoice_recurring(id) ON DELETE SET NULL,
  -- 'YYYY-MM' u pravidelné faktury: za který měsíc koncept vznikl.
  period        text CHECK (period IS NULL OR period ~ '^\d{4}-\d{2}$'),
  counterparty  jsonb NOT NULL,
  client_email  text NOT NULL DEFAULT '',
  items         jsonb NOT NULL DEFAULT '[]'::jsonb,
  currency      text NOT NULL DEFAULT 'CZK' CHECK (currency IN ('CZK', 'EUR')),
  due_days      integer NOT NULL DEFAULT 14 CHECK (due_days BETWEEN 0 AND 90),
  -- Datum plnění; prázdné = den vystavení (tedy den schválení).
  supplied_on   date,
  note          text NOT NULL DEFAULT '',
  -- draft → sending (zamčeno na dobu vystavení) → issued; nebo dismissed.
  status        text NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'sending', 'issued', 'dismissed')),
  invoice_id    uuid REFERENCES invoices(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  issued_at     timestamptz,
  dismissed_at  timestamptz
);

-- Hotová zakázka připraví koncept **jednou**. Ani zahozený se nezaloží znovu,
-- když zakázku přepnete tam a zpátky — zahodili jste ho vědomě.
CREATE UNIQUE INDEX IF NOT EXISTS invoice_drafts_project_done_key
  ON invoice_drafts (project_id) WHERE source = 'project_done';

-- Pravidelná faktura připraví za měsíc nejvýš jeden koncept (i když cron
-- poběží dvakrát, nebo jste koncept zahodili).
CREATE UNIQUE INDEX IF NOT EXISTS invoice_drafts_recurring_period_key
  ON invoice_drafts (recurring_id, period) WHERE recurring_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS invoice_drafts_open_idx
  ON invoice_drafts (created_at DESC) WHERE status IN ('draft', 'sending');
