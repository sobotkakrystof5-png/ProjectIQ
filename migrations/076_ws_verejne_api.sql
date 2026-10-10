-- Migrace 076: Workspace — veřejné API, objednávací stránka, widget (S11, R-045)
--
-- 1. requests.is_test: zkušební poptávka z „Ověřit napojení“ nebo s `test: true`
--    v API. Neukazuje se v Dnes, Poptávkách ani v kalendáři a nezakládá zákazníka.
-- 2. ws.intake_log: posledních pár požadavků na příjem poptávek pro ladění
--    v Nastavení › Napojený web. Bez IP a bez osobních údajů (jen čas, cesta,
--    doména webu, výsledek). Starší než 30 dní maže aplikace při zápisu.
-- 3. Úzké SECURITY DEFINER funkce: veřejný požadavek ještě nezná účet a pod
--    RLS by bez něj neviděl nic (stejně jako ws.account_by_clerk_org, R-035).
--    Vrací jen to, co je potřeba k ověření, nic o zákaznících.

ALTER TABLE ws.requests ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS ws.intake_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  business_id uuid NOT NULL,
  integration_id uuid,
  -- secret = server webu s tajným klíčem, widget = veřejný klíč z prohlížeče,
  -- page = objednávací stránka /r/[slug], check = „Ověřit napojení“ z aplikace
  channel text NOT NULL CHECK (channel IN ('secret', 'widget', 'page', 'check')),
  origin text CHECK (length(origin) <= 200),
  status smallint NOT NULL CHECK (status BETWEEN 100 AND 599),
  code text CHECK (length(code) <= 40),
  request_id uuid,
  is_test boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (account_id, business_id) REFERENCES ws.businesses(account_id, id) ON DELETE CASCADE,
  FOREIGN KEY (account_id, integration_id) REFERENCES ws.web_integrations(account_id, id) ON DELETE SET NULL (integration_id),
  FOREIGN KEY (account_id, request_id) REFERENCES ws.requests(account_id, id) ON DELETE SET NULL (request_id)
);

CREATE INDEX IF NOT EXISTS intake_log_account_business_idx ON ws.intake_log (account_id, business_id, created_at DESC);
SELECT ws.enable_account_rls('ws.intake_log');

-- Veřejný klíč (widget) → napojení. Jen aktivní napojení nearchivovaného byznysu.
CREATE OR REPLACE FUNCTION ws.integration_by_public_key(p_key text)
RETURNS TABLE (account_id uuid, business_id uuid, integration_id uuid, allowed_origins text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT i.account_id, i.business_id, i.id, i.allowed_origins
  FROM ws.web_integrations i
  JOIN ws.businesses b ON b.account_id = i.account_id AND b.id = i.business_id
  WHERE i.public_key = p_key AND i.active AND i.revoked_at IS NULL AND b.archived_at IS NULL
$$;

-- Prefix tajného klíče → hash k porovnání (porovnává aplikace v konstantním čase).
CREATE OR REPLACE FUNCTION ws.integration_by_secret_prefix(p_prefix text)
RETURNS TABLE (account_id uuid, business_id uuid, integration_id uuid, secret_hash text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT i.account_id, i.business_id, i.id, i.secret_hash
  FROM ws.web_integrations i
  JOIN ws.businesses b ON b.account_id = i.account_id AND b.id = i.business_id
  WHERE i.secret_prefix = p_prefix AND i.secret_hash IS NOT NULL
    AND i.active AND i.revoked_at IS NULL AND b.archived_at IS NULL
$$;

-- Veřejný slug (/r/[slug], /embed/[slug].js) → byznys, veřejný klíč
-- a povolené domény (frame-ancestors, CORS). Slug je veřejný už z URL.
CREATE OR REPLACE FUNCTION ws.business_by_public_slug(p_slug text)
RETURNS TABLE (account_id uuid, business_id uuid, public_key text, allowed_origins text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT b.account_id, b.id,
    (SELECT i.public_key FROM ws.web_integrations i
      WHERE i.account_id = b.account_id AND i.business_id = b.id AND i.active AND i.revoked_at IS NULL
      ORDER BY i.created_at LIMIT 1),
    COALESCE((SELECT array_agg(DISTINCT o) FROM ws.web_integrations i, unnest(i.allowed_origins) o
      WHERE i.account_id = b.account_id AND i.business_id = b.id AND i.active AND i.revoked_at IS NULL), '{}')
  FROM ws.businesses b
  WHERE b.slug = p_slug AND b.archived_at IS NULL
$$;

REVOKE ALL ON FUNCTION ws.integration_by_public_key(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION ws.integration_by_secret_prefix(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION ws.business_by_public_slug(text) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ws_app') THEN
    GRANT EXECUTE ON FUNCTION ws.integration_by_public_key(text) TO ws_app;
    GRANT EXECUTE ON FUNCTION ws.integration_by_secret_prefix(text) TO ws_app;
    GRANT EXECUTE ON FUNCTION ws.business_by_public_slug(text) TO ws_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ws.intake_log TO ws_app;
  END IF;
END
$$;
