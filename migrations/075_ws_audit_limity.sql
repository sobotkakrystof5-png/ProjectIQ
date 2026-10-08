-- Migrace 075: Workspace — audit, idempotence veřejného API, rate limit (S06)
--
-- audit_log je jen pro zápis a čtení: ws_app nemá UPDATE ani DELETE
-- (scripts/ws-grants.sql). rate_limits je systémová tabulka bez RLS a bez
-- osobních údajů — klíč je hash (IP, klíč webu…), ne IP v čitelné podobě.

CREATE TABLE IF NOT EXISTS ws.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES ws.accounts(id) ON DELETE CASCADE,
  business_id uuid,
  actor text NOT NULL,
  action text NOT NULL,
  entity text,
  entity_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (account_id, business_id) REFERENCES ws.businesses(account_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS audit_log_account_idx ON ws.audit_log (account_id, created_at DESC);
SELECT ws.enable_account_rls('ws.audit_log');

-- Hlavička Idempotency-Key u POST /api/public/v1/requests, platí 24 h.
CREATE TABLE IF NOT EXISTS ws.idempotency_keys (
  account_id uuid NOT NULL REFERENCES ws.accounts(id) ON DELETE CASCADE,
  key text NOT NULL CHECK (length(key) BETWEEN 1 AND 200),
  request_hash text NOT NULL,
  response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours',
  PRIMARY KEY (account_id, key)
);

CREATE INDEX IF NOT EXISTS idempotency_keys_expires_idx ON ws.idempotency_keys (expires_at);
SELECT ws.enable_account_rls('ws.idempotency_keys');

CREATE TABLE IF NOT EXISTS ws.rate_limits (
  key text NOT NULL CHECK (length(key) <= 200),
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 1 CHECK (count >= 0),
  PRIMARY KEY (key, window_start)
);

CREATE INDEX IF NOT EXISTS rate_limits_window_idx ON ws.rate_limits (window_start);
