-- Migrace 082: Workspace — klientský portál /z/[token] (S16, R-051)
--
-- 1. appointments.public_token: náhodný odkaz na termín (jobs ho mají od 068).
--    Token generuje DB (gen_random_uuid = 122 náhodných bitů), v URL není
--    nic jiného — žádné ID účtu, jméno ani e-mail.
-- 2. jobs.result_url: odkaz na výsledek práce (galerie, dokument, web).
-- 3. ws.job_updates: zprávy firmy k zakázce, které zákazník vidí v portálu.
--    Interní poznámky (appointments.note, customers.note) se do portálu
--    nikdy nečtou — co má vidět zákazník, je jen tady. Smazání = deleted_at
--    (jde vrátit „Zpět“).
-- 4. ws.reviews: hodnocení 1–10 s komentářem, nejvýš jedno na termín nebo
--    zakázku (hlídá DB unikátním indexem).
-- 5. message_settings: e-mail zákazníkovi o nové zprávě k zakázce.
-- 6. ws.portal_lookup: SECURITY DEFINER převod tokenu na účet a záznam.
--    Veřejná stránka účet nezná a pod RLS by neviděla nic (stejně jako
--    ws.business_by_public_slug, R-035). Vrací jen ID, nic o zákaznících.

-- 1 ---------------------------------------------------------------------------
-- Volatilní výchozí hodnota: každý existující řádek dostane vlastní token.
ALTER TABLE ws.appointments ADD COLUMN IF NOT EXISTS public_token uuid NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS appointments_public_token_uq ON ws.appointments (public_token);

-- 2 ---------------------------------------------------------------------------
ALTER TABLE ws.jobs ADD COLUMN IF NOT EXISTS result_url text;
ALTER TABLE ws.jobs DROP CONSTRAINT IF EXISTS jobs_result_url_check;
ALTER TABLE ws.jobs ADD CONSTRAINT jobs_result_url_check
  CHECK (result_url IS NULL OR (result_url ~ '^https://' AND length(result_url) <= 500));

-- 3 ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ws.job_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  business_id uuid NOT NULL,
  job_id uuid NOT NULL,
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  -- smazání jde vrátit („Zpět“), proto jen značka
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id),
  FOREIGN KEY (account_id, business_id) REFERENCES ws.businesses(account_id, id) ON DELETE CASCADE,
  FOREIGN KEY (account_id, job_id) REFERENCES ws.jobs(account_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS job_updates_job_idx ON ws.job_updates (account_id, job_id, created_at DESC);
SELECT ws.enable_account_rls('ws.job_updates');

-- 4 ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ws.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  business_id uuid NOT NULL,
  customer_id uuid,
  job_id uuid,
  appointment_id uuid,
  score smallint NOT NULL CHECK (score BETWEEN 1 AND 10),
  comment text CHECK (comment IS NULL OR length(comment) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id),
  CHECK (num_nonnulls(job_id, appointment_id) = 1),
  FOREIGN KEY (account_id, business_id) REFERENCES ws.businesses(account_id, id) ON DELETE CASCADE,
  FOREIGN KEY (account_id, customer_id) REFERENCES ws.customers(account_id, id) ON DELETE SET NULL (customer_id),
  FOREIGN KEY (account_id, job_id) REFERENCES ws.jobs(account_id, id) ON DELETE CASCADE,
  FOREIGN KEY (account_id, appointment_id) REFERENCES ws.appointments(account_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS reviews_account_business_idx ON ws.reviews (account_id, business_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS reviews_job_uq ON ws.reviews (job_id) WHERE job_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS reviews_appointment_uq ON ws.reviews (appointment_id) WHERE appointment_id IS NOT NULL;
SELECT ws.enable_account_rls('ws.reviews');

-- 5 ---------------------------------------------------------------------------
ALTER TABLE ws.message_settings DROP CONSTRAINT IF EXISTS message_settings_type_check;
ALTER TABLE ws.message_settings ADD CONSTRAINT message_settings_type_check CHECK (type IN (
  'request_received', 'booking_confirmed', 'booking_changed', 'reminder', 'thank_you',
  'reward_ready', 'invoice', 'new_request', 'daily_digest', 'weekly_digest', 'monthly_digest',
  'booking_declined', 'invoice_overdue', 'vat_limit', 'job_update'
));

-- 6 ---------------------------------------------------------------------------
-- Jen návštěvy (blokace odkaz nemají) a jen byznysy, které nejsou archivované.
-- Zapnutí funkce Klientský portál kontroluje aplikace (stejná 404).
CREATE OR REPLACE FUNCTION ws.portal_lookup(p_token uuid)
RETURNS TABLE (account_id uuid, business_id uuid, kind text, record_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT x.account_id, x.business_id, x.kind, x.record_id FROM (
    SELECT a.account_id, a.business_id, 'appointment'::text AS kind, a.id AS record_id
    FROM ws.appointments a
    JOIN ws.businesses b ON b.account_id = a.account_id AND b.id = a.business_id AND b.archived_at IS NULL
    WHERE a.public_token = p_token AND a.kind = 'visit'
    UNION ALL
    SELECT j.account_id, j.business_id, 'job'::text, j.id
    FROM ws.jobs j
    JOIN ws.businesses b ON b.account_id = j.account_id AND b.id = j.business_id AND b.archived_at IS NULL
    WHERE j.public_token = p_token
  ) x
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION ws.portal_lookup(uuid) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ws_app') THEN
    GRANT EXECUTE ON FUNCTION ws.portal_lookup(uuid) TO ws_app;
  END IF;
END
$$;
