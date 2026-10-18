-- Migrace 087: Workspace — výběr pracovníka a odkaz na čekající poptávku (RD07).
--
-- Veřejná objednávka ukládá požadovaného pracovníka, aby se při potvrzení
-- předvolil. Každá poptávka dostane náhodný odkaz do klientského portálu;
-- po potvrzení se stejný odkaz přesměruje na vzniklý termín.

ALTER TABLE ws.requests
  ADD COLUMN IF NOT EXISTS requested_staff_id uuid,
  ADD COLUMN IF NOT EXISTS public_token uuid NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS requests_public_token_uq ON ws.requests (public_token);

DO $$ BEGIN
  ALTER TABLE ws.requests ADD CONSTRAINT requests_requested_staff_fk
    FOREIGN KEY (account_id, requested_staff_id)
    REFERENCES ws.staff (account_id, id) ON DELETE SET NULL (requested_staff_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Portálový odkaz poptávky po potvrzení otevře termín, který z ní vznikl.
-- Dokud termín neexistuje, vrátí se jen minimální informace o poptávce.
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
    UNION ALL
    SELECT r.account_id, r.business_id,
      CASE WHEN a.id IS NULL THEN 'request'::text ELSE 'appointment'::text END,
      COALESCE(a.id, r.id)
    FROM ws.requests r
    JOIN ws.businesses b ON b.account_id = r.account_id AND b.id = r.business_id AND b.archived_at IS NULL
    LEFT JOIN LATERAL (
      SELECT ap.id FROM ws.appointments ap
      WHERE ap.account_id = r.account_id AND ap.business_id = r.business_id
        AND ap.request_id = r.id AND ap.kind = 'visit'
      ORDER BY ap.created_at DESC LIMIT 1
    ) a ON true
    WHERE r.public_token = p_token AND NOT r.is_test AND r.customer_id IS NOT NULL
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
