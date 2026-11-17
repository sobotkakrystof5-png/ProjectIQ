-- Migrace 114: hovory od asistenta z Growth OS (R-112)
--
-- (113 drží větev auth/supabase-klient — přihlášení klientů přes Supabase.
-- Dokud se nesloučí, je na téhle větvi v číslech mezera a test číslování
-- `ws-schema` hlásí chybu; zmizí po sloučení obou větví.)
--
-- Growth OS (repozitář vizeon-autopilot) volá firmám přes AI agenta,
-- staví jim ukázkové weby a posílá e-maily. Všechno vede v Cloudflare D1.
-- Sem posílá **snímek stavu** každé firmy: poslední hovor, ukázku a e-maily.
-- Jeden řádek = jedna firma z D1 (`external_id`), opakované poslání ho
-- přepíše, starší snímek novější nepřepíše (`source_updated_at`).
--
-- Rozdělení pravdy: D1 rozhoduje, komu robot volá (fronta, seznam nevolat).
-- Tahle tabulka je kopie pro Kryštofa + to, co s firmou udělal on sám
-- (`handled_*`, `client_lead_id`). Snímek z Growth OS nikdy nepřepíše
-- sloupce, které patří adminu.
--
-- Aditivní a idempotentní, smí jít na produkci před nasazením větve.
-- Bez ní endpoint vrátí 503 a záložka „Od asistenta" se neukáže.

CREATE TABLE IF NOT EXISTS outreach_leads (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Klíč z Growth OS, např. „vizeon-outreach:123". Nikdy se nemění.
  external_id          text NOT NULL,
  source_updated_at    timestamptz NOT NULL,
  received_at          timestamptz NOT NULL DEFAULT now(),

  company_name         text NOT NULL,
  contact_name         text,
  phone                text,
  email                text,
  website              text,
  industry             text,
  city                 text,
  -- Stav firmy v D1 (new, called, accepted, callback_later, demo_ready, email_sent…).
  status               text NOT NULL,
  do_not_call          boolean NOT NULL DEFAULT false,
  attempts             integer NOT NULL DEFAULT 0,

  -- Poslední hovor. `summary` je text od modelu o skutečném člověku:
  -- vykresluje se jen jako text a klientovi se neposílá.
  last_call_at         timestamptz,
  last_outcome         text,
  call_summary         text,
  -- Kdy chce klient zavolat: přesný čas (když si ho v hovoru vybral)
  -- a slovy, jak to řekl.
  callback_at          timestamptz,
  callback_text        text,

  -- Ukázkový web.
  demo_url             text,
  demo_status          text,
  demo_built_at        timestamptz,
  demo_views           integer NOT NULL DEFAULT 0,
  demo_first_viewed_at timestamptz,

  -- E-maily z Resendu.
  cold_email_sent_at   timestamptz,
  demo_email_sent_at   timestamptz,
  email_opened_at      timestamptz,
  email_clicked_at     timestamptz,
  email_replied_at     timestamptz,

  -- Co s firmou udělal Kryštof. Snímek z Growth OS na tyhle sloupce nesahá.
  handled_at           timestamptz,
  handled_reason       text,
  client_lead_id       uuid REFERENCES client_leads(id) ON DELETE SET NULL,

  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS outreach_leads_external_id_key
  ON outreach_leads (external_id);

-- Fronta „Komu zavolat" čte jen nevyřízené a ty, kterým se smí volat.
CREATE INDEX IF NOT EXISTS outreach_leads_queue_idx
  ON outreach_leads (status)
  WHERE handled_at IS NULL AND do_not_call = false;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'outreach_leads_handled_reason_check') THEN
    ALTER TABLE outreach_leads ADD CONSTRAINT outreach_leads_handled_reason_check
      CHECK (handled_reason IS NULL OR handled_reason IN ('prevzato', 'nezajem'));
  END IF;
  -- Odkazy se vykreslují jako href: jen https, nic jiného.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'outreach_leads_https_check') THEN
    ALTER TABLE outreach_leads ADD CONSTRAINT outreach_leads_https_check
      CHECK ((demo_url IS NULL OR demo_url LIKE 'https://%') AND (website IS NULL OR website LIKE 'https://%' OR website LIKE 'http://%'));
  END IF;
END
$$;
