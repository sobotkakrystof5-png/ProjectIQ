-- Klientský prostor III (KP07): požadavky, zprávy a hodnocení pod přihlášením.
--
-- Klient (role portal_app) do těchto tabulek nezapisuje přímo, jen přes funkce
-- portal.submit_request / submit_message / submit_feedback. Funkce ověří, že
-- zakázka i člen patří aktuálnímu klientovi (app.client_id), hlídají limity
-- a požadavek i hodnocení zapíšou i do interních tabulek admina (public.client_requests,
-- public.client_feedback), které portal_app nevidí. Zprávy od admina vkládá
-- vlastník tabulek. Vyžaduje migrace 092 a 095. Idempotentní.

CREATE TABLE IF NOT EXISTS portal.requests (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL,
  project_id uuid NOT NULL,
  member_id uuid NOT NULL,
  source text NOT NULL CHECK (source IN ('text', 'voice')),
  body text NOT NULL CHECK (char_length(body) BETWEEN 3 AND 3000),
  -- Co vidí klient: odesláno · vyřízeno · uzavřeno bez řešení.
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'done', 'dismissed')),
  admin_request_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (client_id, project_id) REFERENCES portal.projects (client_id, id) ON DELETE CASCADE,
  FOREIGN KEY (client_id, member_id) REFERENCES portal.members (client_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS portal_requests_project_idx ON portal.requests (client_id, project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS portal_requests_admin_idx ON portal.requests (admin_request_id);

CREATE TABLE IF NOT EXISTS portal.messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL,
  project_id uuid NOT NULL,
  author text NOT NULL CHECK (author IN ('client', 'admin')),
  member_id uuid,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (client_id, project_id) REFERENCES portal.projects (client_id, id) ON DELETE CASCADE,
  FOREIGN KEY (client_id, member_id) REFERENCES portal.members (client_id, id) ON DELETE SET NULL (member_id)
);
CREATE INDEX IF NOT EXISTS portal_messages_project_idx ON portal.messages (client_id, project_id, created_at);

CREATE TABLE IF NOT EXISTS portal.feedback (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL,
  project_id uuid NOT NULL,
  member_id uuid NOT NULL,
  nps integer NOT NULL CHECK (nps BETWEEN 1 AND 10),
  content text CHECK (content IS NULL OR char_length(content) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, member_id),
  FOREIGN KEY (client_id, project_id) REFERENCES portal.projects (client_id, id) ON DELETE CASCADE,
  FOREIGN KEY (client_id, member_id) REFERENCES portal.members (client_id, id) ON DELETE CASCADE
);

ALTER TABLE portal.requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal.feedback ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['requests', 'messages', 'feedback'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'portal' AND tablename = t AND policyname = 'client_isolation') THEN
      EXECUTE format(
        'CREATE POLICY client_isolation ON portal.%I USING (client_id = portal.current_client()) WITH CHECK (client_id = portal.current_client())',
        t
      );
    END IF;
  END LOOP;
END $$;

-- Společná kontrola: zakázka a člen patří aktuálnímu klientovi.
CREATE OR REPLACE FUNCTION portal.assert_member_project(p_project uuid, p_member uuid)
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, portal AS $$
DECLARE
  cid uuid := portal.current_client();
BEGIN
  IF cid IS NULL
     OR NOT EXISTS (SELECT 1 FROM portal.projects WHERE id = p_project AND client_id = cid)
     OR NOT EXISTS (SELECT 1 FROM portal.members WHERE id = p_member AND client_id = cid AND removed_at IS NULL) THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;
  RETURN cid;
END
$$;

-- Požadavek klienta: nejvýš 5 za 30 minut na člena. Zapíše se i do fronty admina.
CREATE OR REPLACE FUNCTION portal.submit_request(p_project uuid, p_member uuid, p_source text, p_text text)
RETURNS TABLE (id uuid, admin_request_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, portal, public AS $$
DECLARE
  cid uuid := portal.assert_member_project(p_project, p_member);
  admin_id uuid;
  new_id uuid;
BEGIN
  IF p_source NOT IN ('text', 'voice') OR p_text IS NULL OR char_length(btrim(p_text)) NOT BETWEEN 3 AND 3000 THEN
    RAISE EXCEPTION 'invalid' USING ERRCODE = 'P0001';
  END IF;
  IF (SELECT count(*) FROM portal.requests r WHERE r.member_id = p_member AND r.created_at > now() - interval '30 minutes') >= 5 THEN
    RAISE EXCEPTION 'rate_limited' USING ERRCODE = 'P0429';
  END IF;

  INSERT INTO public.client_requests (project_id, source, raw_text)
  VALUES (p_project, p_source, btrim(p_text))
  RETURNING public.client_requests.id INTO admin_id;

  INSERT INTO portal.requests (client_id, project_id, member_id, source, body, admin_request_id)
  VALUES (cid, p_project, p_member, p_source, btrim(p_text), admin_id)
  RETURNING portal.requests.id INTO new_id;

  RETURN QUERY SELECT new_id, admin_id;
END
$$;

-- Zpráva klienta: nejvýš 20 za hodinu na člena.
CREATE OR REPLACE FUNCTION portal.submit_message(p_project uuid, p_member uuid, p_body text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, portal AS $$
DECLARE
  cid uuid := portal.assert_member_project(p_project, p_member);
  new_id uuid;
BEGIN
  IF p_body IS NULL OR char_length(btrim(p_body)) NOT BETWEEN 1 AND 2000 THEN
    RAISE EXCEPTION 'invalid' USING ERRCODE = 'P0001';
  END IF;
  IF (SELECT count(*) FROM portal.messages m WHERE m.member_id = p_member AND m.author = 'client' AND m.created_at > now() - interval '1 hour') >= 20 THEN
    RAISE EXCEPTION 'rate_limited' USING ERRCODE = 'P0429';
  END IF;
  INSERT INTO portal.messages (client_id, project_id, author, member_id, body)
  VALUES (cid, p_project, 'client', p_member, btrim(p_body))
  RETURNING portal.messages.id INTO new_id;
  RETURN new_id;
END
$$;

-- Hodnocení: jen u hotové (nebo zaplacené) zakázky a jednou na člena. Zapíše se i adminovi.
CREATE OR REPLACE FUNCTION portal.submit_feedback(p_project uuid, p_member uuid, p_nps integer, p_content text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, portal, public AS $$
DECLARE
  cid uuid := portal.assert_member_project(p_project, p_member);
  new_id uuid;
BEGIN
  IF p_nps IS NULL OR p_nps NOT BETWEEN 1 AND 10 OR (p_content IS NOT NULL AND char_length(p_content) > 2000) THEN
    RAISE EXCEPTION 'invalid' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM portal.projects WHERE id = p_project AND client_id = cid AND status IN ('done', 'paid')) THEN
    RAISE EXCEPTION 'not_done' USING ERRCODE = 'P0422';
  END IF;
  IF EXISTS (SELECT 1 FROM portal.feedback WHERE project_id = p_project AND member_id = p_member) THEN
    RAISE EXCEPTION 'already_rated' USING ERRCODE = 'P0409';
  END IF;

  INSERT INTO public.client_feedback (project_id, nps, content)
  VALUES (p_project, p_nps, NULLIF(btrim(p_content), ''));

  INSERT INTO portal.feedback (client_id, project_id, member_id, nps, content)
  VALUES (cid, p_project, p_member, p_nps, NULLIF(btrim(p_content), ''))
  RETURNING portal.feedback.id INTO new_id;
  RETURN new_id;
END
$$;

-- Stav požadavku, který vidí klient, následuje práci admina.
CREATE OR REPLACE FUNCTION portal.sync_request_status() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, portal, public AS $$
BEGIN
  UPDATE portal.requests SET status = NEW.status WHERE admin_request_id = NEW.id;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS portal_sync_request_status ON public.client_requests;
CREATE TRIGGER portal_sync_request_status
  AFTER UPDATE OF status ON public.client_requests
  FOR EACH ROW EXECUTE FUNCTION portal.sync_request_status();

REVOKE ALL ON FUNCTION portal.assert_member_project(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION portal.submit_request(uuid, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION portal.submit_message(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION portal.submit_feedback(uuid, uuid, integer, text) FROM PUBLIC;
