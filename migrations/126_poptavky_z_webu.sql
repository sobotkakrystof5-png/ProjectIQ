-- Poptávky z webu klienta (KP17, D-K16, D-K20, R-129). Idempotentní.
--
-- Web, který Kryštof klientovi postavil, po odeslání formuláře pošle ze svého
-- serveru událost „poptávka" nebo „objednávka" na POST /api/public/web-udalost.
-- Ukládá se JEN událost: zakázka, druh, čas. Žádné jméno, e-mail, telefon,
-- text poptávky ani IP (D-K20 = jen počet). Poptávka sama jde klientovi
-- e-mailem jako dřív — ZakazIQ ji nikdy nevidí.
--
-- Pozor: tohle NENÍ příjem `lib/web-leads.ts` (Kryštofova schránka Poptávky).
--
-- Klíč webu zakázky má stejný tvar ochrany jako klíč pro hlášení z Claude Code
-- (migrace 094): v databázi je jen prefix a HMAC-SHA256 celého klíče s pepřem,
-- klíč se ukáže jednou. Otočení = starý se zneplatní (řádek zůstane jako záznam).
-- Klient čte jen měsíční součty svých zakázek přes portal.web_lead_months().

CREATE TABLE IF NOT EXISTS project_web_keys (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  prefix text NOT NULL,
  key_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  last_used_at timestamptz,
  revoked_at timestamptz,
  revoked_by text
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_web_keys_prefix_key') THEN
    ALTER TABLE project_web_keys ADD CONSTRAINT project_web_keys_prefix_key UNIQUE (prefix);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_web_keys_prefix_check') THEN
    ALTER TABLE project_web_keys
      ADD CONSTRAINT project_web_keys_prefix_check CHECK (prefix ~ '^[A-Za-z0-9]{10}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_web_keys_hash_check') THEN
    ALTER TABLE project_web_keys
      ADD CONSTRAINT project_web_keys_hash_check CHECK (key_hash ~ '^[0-9a-f]{64}$');
  END IF;
END $$;

-- Nejvýš jeden platný klíč na zakázku.
CREATE UNIQUE INDEX IF NOT EXISTS project_web_keys_active_idx
  ON project_web_keys (project_id) WHERE revoked_at IS NULL;

-- Události bez osobních údajů. Žijí se zakázkou (smazání zakázky je vezme
-- s sebou); vlastní retenci nepotřebují, nic o lidech v nich není.
-- key_id: když klíč unikne, jdou smazat přesně události, které přes něj přišly.
CREATE TABLE IF NOT EXISTS project_web_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key_id uuid REFERENCES project_web_keys(id) ON DELETE SET NULL,
  kind text NOT NULL,
  is_test boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_web_events_kind_check') THEN
    ALTER TABLE project_web_events
      ADD CONSTRAINT project_web_events_kind_check CHECK (kind IN ('poptavka', 'objednavka'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS project_web_events_project_idx
  ON project_web_events (project_id, created_at DESC);

-- Měsíční součty pro klienta: posledních 12 měsíců (pražský čas) u každé jeho
-- zakázky, která má platný klíč webu, nebo v tom období aspoň jednu událost.
-- Zkušební události se nepočítají. Členství se ověřuje jako u client_surveys.
CREATE OR REPLACE FUNCTION portal.web_lead_months(p_member uuid)
RETURNS TABLE (project_id uuid, month date, poptavky integer, objednavky integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, portal, public AS $$
DECLARE
  cid uuid := portal.current_client();
  this_month date := date_trunc('month', now() AT TIME ZONE 'Europe/Prague')::date;
  since timestamptz := ((date_trunc('month', now() AT TIME ZONE 'Europe/Prague') - interval '11 months') AT TIME ZONE 'Europe/Prague');
BEGIN
  IF cid IS NULL OR NOT EXISTS (
    SELECT 1 FROM portal.members m WHERE m.id = p_member AND m.client_id = cid AND m.removed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;

  RETURN QUERY
  WITH connected AS (
    SELECT pp.id AS pid FROM portal.projects pp
    WHERE pp.client_id = cid
      AND (
        EXISTS (SELECT 1 FROM public.project_web_keys k WHERE k.project_id = pp.id AND k.revoked_at IS NULL)
        OR EXISTS (
          SELECT 1 FROM public.project_web_events e
          WHERE e.project_id = pp.id AND NOT e.is_test AND e.created_at >= since
        )
      )
  ), months AS (
    SELECT (this_month - make_interval(months => g))::date AS m FROM generate_series(0, 11) AS g
  )
  SELECT c.pid,
         mo.m,
         (count(e.id) FILTER (WHERE e.kind = 'poptavka'))::integer,
         (count(e.id) FILTER (WHERE e.kind = 'objednavka'))::integer
  FROM connected c
  CROSS JOIN months mo
  LEFT JOIN public.project_web_events e
    ON e.project_id = c.pid
   AND NOT e.is_test
   AND e.created_at >= (mo.m::timestamp AT TIME ZONE 'Europe/Prague')
   AND e.created_at < ((mo.m + interval '1 month')::timestamp AT TIME ZONE 'Europe/Prague')
  GROUP BY c.pid, mo.m
  ORDER BY c.pid, mo.m;
END
$$;

REVOKE ALL ON FUNCTION portal.web_lead_months(uuid) FROM PUBLIC;
