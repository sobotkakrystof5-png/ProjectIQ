-- Migrace 081: Workspace — e-maily, jednorázové odkazy, novinky (S15)
--
-- 1. message_settings: odmítnutí/zrušení termínu zákazníkovi a další
--    upozornění majiteli (faktura po splatnosti, limit DPH). Neúspěšná platba
--    předplatného chodí vždy, nastavení nemá.
-- 2. outbound_messages.dedupe_key: jedna zpráva na událost (připomínka
--    termínu, přehled dne…) — opakovaný cron ani souběh ji nezdvojí.
-- 3. ws.action_tokens: jednorázové odkazy v e-mailu majiteli (Potvrdit /
--    Jiný čas bez přihlášení). Platnost 72 h, po použití neplatné. Odkaz nese
--    jen ID tokenu a účtu s podpisem (HMAC), tajemství v DB není.
-- 4. ws.product_news: novinky ZakazIQ pro všechny účty (píše admin, S17).
--    Globální tabulka bez dat účtů a bez osobních údajů; ws_app jen čte.
-- 5. Novinky e-mailem jde vypnout za účet, „Co je nového“ si pamatuje člen.
-- 6. ws.accounts_with_due_messages: SECURITY DEFINER seznam účtů s e-maily
--    k odeslání pro denní cron (pod RLS by cron neviděl nic). Jen ID účtů.

-- 1 ---------------------------------------------------------------------------
ALTER TABLE ws.message_settings DROP CONSTRAINT IF EXISTS message_settings_type_check;
ALTER TABLE ws.message_settings ADD CONSTRAINT message_settings_type_check CHECK (type IN (
  'request_received', 'booking_confirmed', 'booking_changed', 'reminder', 'thank_you',
  'reward_ready', 'invoice', 'new_request', 'daily_digest', 'weekly_digest', 'monthly_digest',
  'booking_declined', 'invoice_overdue', 'vat_limit'
));

-- 2 ---------------------------------------------------------------------------
ALTER TABLE ws.outbound_messages ADD COLUMN IF NOT EXISTS dedupe_key text CHECK (length(dedupe_key) <= 200);
CREATE UNIQUE INDEX IF NOT EXISTS outbound_messages_dedupe_uq
  ON ws.outbound_messages (account_id, dedupe_key) WHERE dedupe_key IS NOT NULL;

-- 3 ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ws.action_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  business_id uuid NOT NULL,
  request_id uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (account_id, business_id) REFERENCES ws.businesses(account_id, id) ON DELETE CASCADE,
  FOREIGN KEY (account_id, request_id) REFERENCES ws.requests(account_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS action_tokens_account_idx ON ws.action_tokens (account_id, request_id);
SELECT ws.enable_account_rls('ws.action_tokens');

-- 4 ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ws.product_news (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  body text NOT NULL CHECK (length(body) <= 2000),
  link_url text CHECK (link_url ~ '^https://'),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS product_news_published_idx ON ws.product_news (published_at DESC) WHERE published_at IS NOT NULL;

-- Výchozí práva (scripts/ws-grants.sql) dávají ws_app i zápis — novinky píše
-- jen admin (vlastník tabulek).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ws_app') THEN
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ws.product_news FROM ws_app;
    GRANT SELECT ON ws.product_news TO ws_app;
  END IF;
END
$$;

-- 5 ---------------------------------------------------------------------------
ALTER TABLE ws.accounts ADD COLUMN IF NOT EXISTS news_emails boolean NOT NULL DEFAULT true;
ALTER TABLE ws.members ADD COLUMN IF NOT EXISTS news_seen_at timestamptz;

-- 6 ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ws.accounts_with_due_messages()
RETURNS TABLE (account_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT DISTINCT m.account_id FROM ws.outbound_messages m
  WHERE (m.status = 'queued' AND m.next_attempt_at <= now())
     OR (m.status = 'sending' AND m.updated_at < now() - interval '15 minutes')
$$;

REVOKE ALL ON FUNCTION ws.accounts_with_due_messages() FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ws_app') THEN
    GRANT EXECUTE ON FUNCTION ws.accounts_with_due_messages() TO ws_app;
  END IF;
END
$$;
