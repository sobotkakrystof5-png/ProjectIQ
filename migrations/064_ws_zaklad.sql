-- Migrace 064: ZakazIQ Workspace — schéma ws, účty, členové, byznysy, funkce (S06, R-014, R-035)
--
-- Všechny tabulky Workspace žijí ve schématu ws a nesou account_id. Aplikace
-- se připojuje rolí ws_app (scripts/ws-create-role.js), pro kterou platí Row
-- Level Security: vidí jen řádky účtu nastaveného v transakci přes
-- set_config('app.account_id', <uuid>, true). RLS je druhá pojistka, filtr
-- account_id = ctx.accountId v aplikaci zůstává povinný (AGENTS.md B3).
--
-- Vlastník tabulek (role, která pouští migrace) RLS nepodléhá — proto admin
-- konzole čte ws bez dalšího nastavení.
--
-- Vazby mezi tabulkami jsou složené cizí klíče (account_id, x_id): kontrola
-- cizího klíče RLS obchází, bez account_id v klíči by šlo připojit řádek
-- cizího účtu, kdyby někdo znal jeho UUID.

CREATE SCHEMA IF NOT EXISTS ws;

-- Na produkčním Neonu už existuje (public), tady jen pro čistou DB.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Účet z transakce. Po skončení transakce vrací current_setting prázdný
-- řetězec (ne NULL), proto NULLIF — jinak by ''::uuid shodil každý dotaz.
CREATE OR REPLACE FUNCTION ws.current_account() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.account_id', true), '')::uuid
$$;

-- Zapne RLS a vytvoří politiku account_isolation (idempotentně).
CREATE OR REPLACE FUNCTION ws.enable_account_rls(tbl regclass, col text DEFAULT 'account_id')
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  tbl_name text := (SELECT relname FROM pg_class WHERE oid = tbl);
BEGIN
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', tbl);
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'ws' AND tablename = tbl_name AND policyname = 'account_isolation'
  ) THEN
    EXECUTE format(
      'CREATE POLICY account_isolation ON %s USING (%I = ws.current_account()) WITH CHECK (%I = ws.current_account())',
      tbl, col, col
    );
  END IF;
END
$$;

REVOKE ALL ON FUNCTION ws.enable_account_rls(regclass, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION ws.touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION ws.add_touch_trigger(tbl regclass) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format(
    'CREATE OR REPLACE TRIGGER touch_updated_at BEFORE UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION ws.touch_updated_at()',
    tbl
  );
END
$$;

REVOKE ALL ON FUNCTION ws.add_touch_trigger(regclass) FROM PUBLIC;

-- Účet = firma (Clerk Organization), jedno IČO, jedno předplatné.
-- Zkušební doba 14 dní bez karty se počítá tady, ne ve Stripe (R-019).
CREATE TABLE IF NOT EXISTS ws.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_org_id text NOT NULL UNIQUE,
  name text NOT NULL,
  ico text CHECK (ico ~ '^[0-9]{8}$'),
  stripe_customer_id text UNIQUE,
  trial_ends_at timestamptz NOT NULL DEFAULT now() + interval '14 days',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

SELECT ws.enable_account_rls('ws.accounts', 'id');
SELECT ws.add_touch_trigger('ws.accounts');

CREATE TABLE IF NOT EXISTS ws.members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES ws.accounts(id) ON DELETE CASCADE,
  clerk_user_id text NOT NULL,
  role text NOT NULL DEFAULT 'staff' CHECK (role IN ('owner', 'staff')),
  name text,
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, clerk_user_id),
  UNIQUE (account_id, id)
);

SELECT ws.enable_account_rls('ws.members');
SELECT ws.add_touch_trigger('ws.members');

-- Byznys uvnitř účtu. Slug je unikátní globálně kvůli /r/[slug] a
-- /embed/[slug].js (R-016). V ceně je zatím jeden byznys na účet (R-026),
-- datový model počítá s víc.
CREATE TABLE IF NOT EXISTS ws.businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES ws.accounts(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) <= 60),
  industry text NOT NULL DEFAULT 'vlastni',
  color text CHECK (color ~ '^#[0-9a-fA-F]{6}$'),
  logo_url text,
  timezone text NOT NULL DEFAULT 'Europe/Prague',
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id)
);

SELECT ws.enable_account_rls('ws.businesses');
SELECT ws.add_touch_trigger('ws.businesses');

-- Funkce (v kódu „moduly“) zapnuté pro byznys. Chybějící řádek = výchozí
-- stav z kódu (lib/ws/templates), Poptávky a Zákazníci jsou vždy zapnuté.
CREATE TABLE IF NOT EXISTS ws.business_modules (
  account_id uuid NOT NULL,
  business_id uuid NOT NULL,
  module text NOT NULL CHECK (module IN (
    'requests', 'customers', 'calendar', 'jobs', 'loyalty', 'invoices',
    'finance', 'taxes', 'portal', 'reviews', 'reminders'
  )),
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, module),
  FOREIGN KEY (account_id, business_id) REFERENCES ws.businesses(account_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS business_modules_account_business_idx ON ws.business_modules (account_id, business_id);
SELECT ws.enable_account_rls('ws.business_modules');
SELECT ws.add_touch_trigger('ws.business_modules');

-- Jediný dotaz, který requireWorkspace() dělá dřív, než účet zná: pod RLS by
-- bez nastaveného účtu neviděl nic. Vrací jen id, nic dalšího.
CREATE OR REPLACE FUNCTION ws.account_by_clerk_org(org_id text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT id FROM ws.accounts WHERE clerk_org_id = org_id
$$;

REVOKE ALL ON FUNCTION ws.account_by_clerk_org(text) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ws_app') THEN
    GRANT EXECUTE ON FUNCTION ws.account_by_clerk_org(text) TO ws_app;
  END IF;
END
$$;
