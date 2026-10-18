-- Migrace 091: RD09 — skupinové lekce, majitel vypisuje jeden termín s 2–30 místy.
-- Jen připravit; na databázi ji nasazuje majitel projektu.

CREATE TABLE IF NOT EXISTS ws.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  business_id uuid NOT NULL,
  appointment_id uuid NOT NULL,
  service_id uuid NOT NULL,
  capacity smallint NOT NULL CHECK (capacity BETWEEN 2 AND 30),
  reserved smallint NOT NULL DEFAULT 0 CHECK (reserved BETWEEN 0 AND capacity),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id),
  UNIQUE (account_id, business_id, id),
  UNIQUE (account_id, appointment_id),
  FOREIGN KEY (account_id, business_id, appointment_id)
    REFERENCES ws.appointments (account_id, business_id, id) ON DELETE CASCADE,
  FOREIGN KEY (account_id, business_id, service_id)
    REFERENCES ws.services (account_id, business_id, id) ON DELETE NO ACTION
);

CREATE INDEX IF NOT EXISTS sessions_public_idx
  ON ws.sessions (account_id, business_id, service_id, status, appointment_id);

SELECT ws.enable_account_rls('ws.sessions');
SELECT ws.add_touch_trigger('ws.sessions');

ALTER TABLE ws.requests ADD COLUMN IF NOT EXISTS session_id uuid;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'ws.requests'::regclass AND conname = 'requests_session_fk') THEN
    ALTER TABLE ws.requests ADD CONSTRAINT requests_session_fk
      FOREIGN KEY (account_id, business_id, session_id)
      REFERENCES ws.sessions (account_id, business_id, id) ON DELETE SET NULL (session_id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS requests_session_idx ON ws.requests (account_id, business_id, session_id) WHERE session_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS ws.session_attendees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  business_id uuid NOT NULL,
  session_id uuid NOT NULL,
  request_id uuid NOT NULL,
  customer_id uuid,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'confirmed', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id),
  UNIQUE (account_id, request_id),
  FOREIGN KEY (account_id, business_id, session_id)
    REFERENCES ws.sessions (account_id, business_id, id) ON DELETE CASCADE,
  FOREIGN KEY (account_id, business_id, request_id)
    REFERENCES ws.requests (account_id, business_id, id) ON DELETE CASCADE,
  FOREIGN KEY (account_id, customer_id)
    REFERENCES ws.customers (account_id, id) ON DELETE SET NULL (customer_id)
);

CREATE INDEX IF NOT EXISTS session_attendees_roster_idx
  ON ws.session_attendees (account_id, business_id, session_id, status, created_at);

SELECT ws.enable_account_rls('ws.session_attendees');
SELECT ws.add_touch_trigger('ws.session_attendees');

-- GDPR úklid nejprve odstraní skupinové lekce účtů po lhůtě.
-- Jinak by FK na službu bránil kaskádovému smazání účtu.
CREATE OR REPLACE FUNCTION ws.purge_closed_accounts()
RETURNS TABLE (account_id uuid, clerk_org_id text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  DELETE FROM ws.sessions se
  USING ws.accounts a
  WHERE se.account_id = a.id AND a.delete_after IS NOT NULL AND a.delete_after <= now();

  RETURN QUERY
    DELETE FROM ws.accounts a
    WHERE a.delete_after IS NOT NULL AND a.delete_after <= now()
    RETURNING a.id, a.clerk_org_id;
END
$$;

REVOKE ALL ON FUNCTION ws.purge_closed_accounts() FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ws_app') THEN
    GRANT EXECUTE ON FUNCTION ws.purge_closed_accounts() TO ws_app;
  END IF;
END
$$;
