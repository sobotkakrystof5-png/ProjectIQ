-- Migrace 072: Workspace — napojení webu, veřejný a tajný klíč (S06, B6)
--
-- Veřejný klíč (pk_…) je v prohlížeči (widget, objednávací stránka), chrání
-- ho kontrola Origin proti allowed_origins. Tajný klíč (sk_<prefix>_…) se
-- ukazuje jen jednou: ukládá se prefix pro vyhledání a SHA-256 hash s pepřem
-- z WS_KEY_PEPPER, porovnání constant-time v lib/ws/keys.ts (S11).

CREATE TABLE IF NOT EXISTS ws.web_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  business_id uuid NOT NULL,
  name text NOT NULL DEFAULT 'Web',
  public_key text NOT NULL UNIQUE CHECK (public_key ~ '^pk_[A-Za-z0-9_-]{20,}$'),
  secret_prefix text UNIQUE,
  secret_hash text CHECK (secret_hash ~ '^[0-9a-f]{64}$'),
  allowed_origins text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id),
  CHECK ((secret_prefix IS NULL) = (secret_hash IS NULL)),
  FOREIGN KEY (account_id, business_id) REFERENCES ws.businesses(account_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS web_integrations_account_business_idx ON ws.web_integrations (account_id, business_id);
SELECT ws.enable_account_rls('ws.web_integrations');
SELECT ws.add_touch_trigger('ws.web_integrations');

-- Vazba poptávky na napojení, ze kterého přišla (sloupec vznikl v 068).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'requests_integration_fk' AND conrelid = 'ws.requests'::regclass
  ) THEN
    ALTER TABLE ws.requests
      ADD CONSTRAINT requests_integration_fk FOREIGN KEY (account_id, integration_id)
      REFERENCES ws.web_integrations(account_id, id) ON DELETE SET NULL (integration_id);
  END IF;
END
$$;
