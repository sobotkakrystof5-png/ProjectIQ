-- Migrace 145: ukázkový web k nabídce (navrhovač nabídek, R-160, docs/admin/NABIDKY-PLAN.md oddíl 14)
--
-- K nabídce jde poslat i ukázku webu. Ukázky staví Growth OS (vizeon-autopilot,
-- navrhy.vizeon.cz). ZakazIQ si ukázku vyžádá, Growth OS ji postaví a vrátí odkaz
-- na POST /api/public/nabidky/ukazka. Firma od robota už ukázku mít může
-- (outreach_leads.demo_url), tu ZakazIQ použije bez stavby.
--
-- Jeden řádek na nabídku. Smazání nabídky (nebo kontaktu) ho smaže s ní, vlastní
-- retenci nemá: nabídka bez zakázky žije 12 měsíců (migrace 142).
--
-- Idempotentní: druhý běh nic nezmění. Aditivní, starý build tabulku nečte.
-- V textech níž nesmí být středník: běhoun migrací dělí soubor podle něj.

CREATE TABLE IF NOT EXISTS offer_demos (
  proposal_id   uuid        PRIMARY KEY REFERENCES offer_proposals(id) ON DELETE CASCADE,
  -- requested = Growth OS staví, ready = odkaz je, failed = stavba nedoběhla.
  status        text        NOT NULL CHECK (status IN ('requested', 'ready', 'failed')),
  -- robot = hotová ukázka z hovoru Growth OS, build = postavená na žádost ze ZakazIQ.
  source        text        NOT NULL CHECK (source IN ('robot', 'build')),
  -- Jen ukázky z navrhy.vizeon.cz, s lomítkem na konci i bez.
  url           text        CHECK (url IS NULL OR url ~ '^https://navrhy\.vizeon\.cz/[a-z0-9][a-z0-9-]{0,80}/?$'),
  -- Kód důvodu, text chyby od Growth OS se neukládá.
  error         text        CHECK (error IS NULL OR error IN ('dispatch_failed', 'build_failed', 'timeout', 'no_email')),
  requested_at  timestamptz,
  ready_at      timestamptz,
  -- Kdy odešel e-mail s ukázkou klientovi.
  sent_at       timestamptz,
  attempts      integer     NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 20),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT offer_demos_ready_has_url CHECK (status <> 'ready' OR url IS NOT NULL)
);

COMMENT ON TABLE offer_demos IS
  'Ukázkový web k nabídce (R-160). Staví ho Growth OS, ZakazIQ drží odkaz a stav. Maže se s nabídkou.';

CREATE INDEX IF NOT EXISTS offer_demos_waiting_idx ON offer_demos (requested_at) WHERE status = 'requested';
