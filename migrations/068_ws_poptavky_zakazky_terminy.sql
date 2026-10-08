-- Migrace 068: Workspace — poptávky, zakázky, termíny (S06)
--
-- Poptávka (requests) je to, co přišlo. Potvrzením vznikne termín
-- (appointments) a podle oboru i zakázka (jobs). Poptávky se v kalendáři
-- kreslí čárkovaně z wanted_start/wanted_end, termín vzniká až potvrzením.
--
-- Kolize termínů hlídá databáze (R-005, AGENTS.md B3): EXCLUDE per pracovník,
-- zrušené termíny se nepočítají. Aplikace chytá 23P01.

CREATE TABLE IF NOT EXISTS ws.requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  business_id uuid NOT NULL,
  customer_id uuid,
  service_id uuid,
  -- vazba na ws.web_integrations se přidává v migraci 072
  integration_id uuid,
  wanted_start timestamptz,
  wanted_end timestamptz,
  contact jsonb NOT NULL DEFAULT '{}'::jsonb,
  field_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  message text,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('web', 'widget', 'page', 'eshop', 'phone', 'manual')),
  external_id text,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'confirmed', 'rescheduled', 'declined')),
  handled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id),
  CHECK (wanted_end IS NULL OR wanted_start IS NULL OR wanted_end > wanted_start),
  FOREIGN KEY (account_id, business_id) REFERENCES ws.businesses(account_id, id) ON DELETE CASCADE,
  FOREIGN KEY (account_id, customer_id) REFERENCES ws.customers(account_id, id) ON DELETE SET NULL (customer_id),
  FOREIGN KEY (account_id, service_id) REFERENCES ws.services(account_id, id) ON DELETE SET NULL (service_id)
);

CREATE INDEX IF NOT EXISTS requests_account_business_idx ON ws.requests (account_id, business_id);
CREATE INDEX IF NOT EXISTS requests_inbox_idx ON ws.requests (business_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS requests_customer_idx ON ws.requests (customer_id);
-- e-shop pošle stejnou objednávku dvakrát = jedna poptávka
CREATE UNIQUE INDEX IF NOT EXISTS requests_external_uq ON ws.requests (business_id, external_id) WHERE external_id IS NOT NULL;
SELECT ws.enable_account_rls('ws.requests');
SELECT ws.add_touch_trigger('ws.requests');

-- public_token = odkaz na klientský portál /z/[token] (R-016), generuje DB.
CREATE TABLE IF NOT EXISTS ws.jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  business_id uuid NOT NULL,
  customer_id uuid,
  request_id uuid,
  stage_id uuid,
  title text NOT NULL,
  price numeric(12,2) CHECK (price >= 0),
  deposit numeric(12,2) CHECK (deposit >= 0),
  currency text NOT NULL DEFAULT 'CZK' CHECK (currency ~ '^[A-Z]{3}$'),
  field_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  public_token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  portal_enabled boolean NOT NULL DEFAULT false,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id),
  FOREIGN KEY (account_id, business_id) REFERENCES ws.businesses(account_id, id) ON DELETE CASCADE,
  FOREIGN KEY (account_id, customer_id) REFERENCES ws.customers(account_id, id) ON DELETE SET NULL (customer_id),
  FOREIGN KEY (account_id, request_id) REFERENCES ws.requests(account_id, id) ON DELETE SET NULL (request_id),
  -- stav s rozpracovanými zakázkami nejde smazat, zakázky se nejdřív přesunou
  FOREIGN KEY (account_id, stage_id) REFERENCES ws.stages(account_id, id)
);

CREATE INDEX IF NOT EXISTS jobs_account_business_idx ON ws.jobs (account_id, business_id);
CREATE INDEX IF NOT EXISTS jobs_stage_idx ON ws.jobs (business_id, stage_id);
CREATE INDEX IF NOT EXISTS jobs_customer_idx ON ws.jobs (customer_id);
SELECT ws.enable_account_rls('ws.jobs');
SELECT ws.add_touch_trigger('ws.jobs');

-- kind = 'visit' (návštěva, vždy s pracovníkem) nebo 'block' (dovolená,
-- zavřeno). Blokace bez pracovníka (celý byznys) EXCLUDE nehlídá — tu
-- zohlední výpočet volných slotů.
CREATE TABLE IF NOT EXISTS ws.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  business_id uuid NOT NULL,
  kind text NOT NULL DEFAULT 'visit' CHECK (kind IN ('visit', 'block')),
  staff_id uuid,
  customer_id uuid,
  job_id uuid,
  request_id uuid,
  service_id uuid,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'completed', 'no_show', 'cancelled')),
  title text,
  note text,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id),
  CHECK (ends_at > starts_at),
  CHECK (kind = 'block' OR staff_id IS NOT NULL),
  FOREIGN KEY (account_id, business_id) REFERENCES ws.businesses(account_id, id) ON DELETE CASCADE,
  -- pracovník s termíny se nemaže, jen deaktivuje
  FOREIGN KEY (account_id, staff_id) REFERENCES ws.staff(account_id, id),
  FOREIGN KEY (account_id, customer_id) REFERENCES ws.customers(account_id, id) ON DELETE SET NULL (customer_id),
  FOREIGN KEY (account_id, job_id) REFERENCES ws.jobs(account_id, id) ON DELETE SET NULL (job_id),
  FOREIGN KEY (account_id, request_id) REFERENCES ws.requests(account_id, id) ON DELETE SET NULL (request_id),
  FOREIGN KEY (account_id, service_id) REFERENCES ws.services(account_id, id) ON DELETE SET NULL (service_id),
  CONSTRAINT appointments_no_overlap EXCLUDE USING gist (
    staff_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  ) WHERE (status <> 'cancelled')
);

CREATE INDEX IF NOT EXISTS appointments_account_business_idx ON ws.appointments (account_id, business_id);
CREATE INDEX IF NOT EXISTS appointments_calendar_idx ON ws.appointments (business_id, starts_at);
CREATE INDEX IF NOT EXISTS appointments_customer_idx ON ws.appointments (customer_id);
SELECT ws.enable_account_rls('ws.appointments');
SELECT ws.add_touch_trigger('ws.appointments');
