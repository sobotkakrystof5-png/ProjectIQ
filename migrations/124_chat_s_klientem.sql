-- Migrace 124: chat s klientem jako přes WhatsApp (KP15, R-122, R-123, R-127)
--
-- Jedno vlákno na zakázku (`portal.messages` z migrace 096), kde klient dává
-- veškerou zpětnou vazbu a Kryštof odpovídá. Přibývá:
--   1. druh zprávy (text, hlas, ke schválení, odpověď na schválení), citace
--      jiné zprávy, podpis autora, stav zadání pro Claude Code (R-069),
--   2. `portal.thread_state` — přečteno a poslední návštěva vlákna po stranách.
--      Klient vidí jen, kdy si Kryštof zprávy přečetl (dvě fajfky); kdy byl
--      Kryštof naposledy aktivní, nevidí (práva na sloupce, D-K19),
--   3. `portal.message_attachments` — obrázky a PDF v soukromém úložišti
--      Supabase Storage (D-K18). Smazaná příloha (i retencí R-076 nebo
--      rozpojením zakázky) se zapíše do fronty `public.storage_deletions`
--      a soubor smaže cron,
--   4. úzké funkce: klient píše jen `portal.post_message`, schvaluje
--      `portal.answer_approval`, čte stav `portal.touch_thread`; admin
--      (vlastník tabulek) `public.portal_admin_post` a `public.portal_admin_touch`.
--
-- Vyžaduje migrace 092, 095, 096. Aditivní a idempotentní. Po ní pustit
-- `node scripts/portal-create-role.js` (práva z `scripts/portal-grants.sql`).

-- ─── 1. Zprávy ───────────────────────────────────────────────────────────────

ALTER TABLE portal.messages ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'text';
ALTER TABLE portal.messages ADD COLUMN IF NOT EXISTS reply_to uuid;
-- Podpis: „Kryštof Sobotka" u zpráv admina, jméno člena u klienta.
ALTER TABLE portal.messages ADD COLUMN IF NOT EXISTS author_name text;
-- Ke schválení: 'pending' → 'approved' | 'changes' (jen jednou).
ALTER TABLE portal.messages ADD COLUMN IF NOT EXISTS approval_state text;
ALTER TABLE portal.messages ADD COLUMN IF NOT EXISTS approval_url text;
-- Zadání pro Claude Code udělané z téhle zprávy (public.client_requests).
ALTER TABLE portal.messages ADD COLUMN IF NOT EXISTS admin_request_id uuid;
ALTER TABLE portal.messages ADD COLUMN IF NOT EXISTS request_status text;
-- Změna stavu (schválení, zadání) posune otisk pro živé obnovení.
ALTER TABLE portal.messages ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  -- Zpráva může být jen příloha bez textu: délka 0–2000 místo 1–2000.
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'messages_body_check' AND conrelid = 'portal.messages'::regclass) THEN
    ALTER TABLE portal.messages DROP CONSTRAINT messages_body_check;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'messages_body_length' AND conrelid = 'portal.messages'::regclass) THEN
    ALTER TABLE portal.messages ADD CONSTRAINT messages_body_length CHECK (char_length(body) <= 2000);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'messages_kind_check' AND conrelid = 'portal.messages'::regclass) THEN
    ALTER TABLE portal.messages ADD CONSTRAINT messages_kind_check
      CHECK (kind IN ('text', 'voice', 'approval', 'approval_answer'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'messages_approval_check' AND conrelid = 'portal.messages'::regclass) THEN
    ALTER TABLE portal.messages ADD CONSTRAINT messages_approval_check CHECK (
      (kind = 'approval') = (approval_state IS NOT NULL)
      AND (approval_state IS NULL OR approval_state IN ('pending', 'approved', 'changes'))
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'messages_approval_url_check' AND conrelid = 'portal.messages'::regclass) THEN
    ALTER TABLE portal.messages ADD CONSTRAINT messages_approval_url_check
      CHECK (approval_url IS NULL OR (approval_url LIKE 'https://%' AND char_length(approval_url) <= 500));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'messages_request_status_check' AND conrelid = 'portal.messages'::regclass) THEN
    ALTER TABLE portal.messages ADD CONSTRAINT messages_request_status_check
      CHECK (request_status IS NULL OR request_status IN ('new', 'done', 'dismissed'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'messages_author_name_check' AND conrelid = 'portal.messages'::regclass) THEN
    ALTER TABLE portal.messages ADD CONSTRAINT messages_author_name_check
      CHECK (author_name IS NULL OR char_length(author_name) <= 120);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'messages_client_id_key' AND conrelid = 'portal.messages'::regclass) THEN
    ALTER TABLE portal.messages ADD CONSTRAINT messages_client_id_key UNIQUE (client_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'messages_reply_fk' AND conrelid = 'portal.messages'::regclass) THEN
    ALTER TABLE portal.messages ADD CONSTRAINT messages_reply_fk
      FOREIGN KEY (client_id, reply_to) REFERENCES portal.messages (client_id, id) ON DELETE SET NULL (reply_to);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS portal_messages_request_idx ON portal.messages (admin_request_id) WHERE admin_request_id IS NOT NULL;

-- ─── 2. Přečteno a poslední návštěva vlákna ──────────────────────────────────

CREATE TABLE IF NOT EXISTS portal.thread_state (
  project_id uuid NOT NULL,
  client_id uuid NOT NULL,
  side text NOT NULL CHECK (side IN ('client', 'admin')),
  last_read_at timestamptz,
  -- U klienta s více členy stačí, když si zprávu přečte kdokoli; Kryštof vidí kdo.
  last_read_member uuid,
  -- Poslední obnovení otevřeného vlákna (upozornění e-mailem, D-K19).
  last_seen_at timestamptz,
  last_notified_at timestamptz,
  PRIMARY KEY (project_id, side),
  FOREIGN KEY (client_id, project_id) REFERENCES portal.projects (client_id, id) ON DELETE CASCADE,
  FOREIGN KEY (client_id, last_read_member) REFERENCES portal.members (client_id, id) ON DELETE SET NULL (last_read_member)
);

ALTER TABLE portal.thread_state ENABLE ROW LEVEL SECURITY;

-- ─── 3. Přílohy ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS portal.message_attachments (
  id uuid PRIMARY KEY,
  client_id uuid NOT NULL,
  project_id uuid NOT NULL,
  message_id uuid NOT NULL,
  -- `klient/zakazka/priloha` — soubor v soukromém bucketu, ven jen přes náš server.
  storage_path text NOT NULL UNIQUE
    CHECK (storage_path ~ '^[0-9a-f]{8}-[0-9a-f-]{27}/[0-9a-f]{8}-[0-9a-f-]{27}/[0-9a-f]{8}-[0-9a-f-]{27}$'),
  mime text NOT NULL CHECK (mime IN ('image/png', 'image/jpeg', 'image/webp', 'application/pdf')),
  size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 10485760),
  filename text NOT NULL CHECK (char_length(filename) BETWEEN 1 AND 120),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (client_id, message_id) REFERENCES portal.messages (client_id, id) ON DELETE CASCADE,
  FOREIGN KEY (client_id, project_id) REFERENCES portal.projects (client_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS portal_attachments_message_idx ON portal.message_attachments (client_id, message_id);

ALTER TABLE portal.message_attachments ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['thread_state', 'message_attachments'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'portal' AND tablename = t AND policyname = 'client_isolation') THEN
      EXECUTE format(
        'CREATE POLICY client_isolation ON portal.%I USING (client_id = portal.current_client()) WITH CHECK (client_id = portal.current_client())',
        t
      );
    END IF;
  END LOOP;
END $$;

-- Soubory ke smazání v úložišti. Plní je trigger, maže cron `client-retention`.
CREATE TABLE IF NOT EXISTS public.storage_deletions (
  path text PRIMARY KEY,
  bucket text NOT NULL,
  queued_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION portal.queue_attachment_deletion() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, portal, public AS $$
BEGIN
  INSERT INTO public.storage_deletions (path, bucket) VALUES (OLD.storage_path, 'chat-prilohy')
  ON CONFLICT (path) DO NOTHING;
  RETURN OLD;
END
$$;

DROP TRIGGER IF EXISTS portal_queue_attachment_deletion ON portal.message_attachments;
CREATE TRIGGER portal_queue_attachment_deletion
  AFTER DELETE ON portal.message_attachments
  FOR EACH ROW EXECUTE FUNCTION portal.queue_attachment_deletion();

-- ─── 4. Zápis zpráv ──────────────────────────────────────────────────────────

-- Společné vložení zprávy a příloh pro obě strany. Přílohy přicházejí jako
-- jsonb pole {id, path, mime, size, filename}; cesta musí patřit klientovi
-- a zakázce. Nevolá se zvenku (REVOKE), jen z funkcí níž.
CREATE OR REPLACE FUNCTION portal.insert_message(
  p_client uuid, p_project uuid, p_author text, p_member uuid, p_author_name text,
  p_kind text, p_body text, p_reply_to uuid, p_approval_url text, p_attachments jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, portal AS $$
DECLARE
  v_body text := btrim(COALESCE(p_body, ''));
  v_id uuid;
  v_count integer := COALESCE(jsonb_array_length(CASE WHEN jsonb_typeof(p_attachments) = 'array' THEN p_attachments END), 0);
  a jsonb;
BEGIN
  IF p_attachments IS NOT NULL AND jsonb_typeof(p_attachments) <> 'array' THEN
    RAISE EXCEPTION 'invalid' USING ERRCODE = 'P0001';
  END IF;
  IF char_length(v_body) > 2000 OR v_count > 5 OR (char_length(v_body) = 0 AND v_count = 0) THEN
    RAISE EXCEPTION 'invalid' USING ERRCODE = 'P0001';
  END IF;
  IF p_reply_to IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM portal.messages m WHERE m.id = p_reply_to AND m.client_id = p_client AND m.project_id = p_project
  ) THEN
    RAISE EXCEPTION 'invalid' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO portal.messages (client_id, project_id, author, member_id, author_name, kind, body, reply_to,
                               approval_state, approval_url)
  VALUES (p_client, p_project, p_author, p_member, left(p_author_name, 120), p_kind, v_body, p_reply_to,
          CASE WHEN p_kind = 'approval' THEN 'pending' END, p_approval_url)
  RETURNING id INTO v_id;

  FOR a IN SELECT * FROM jsonb_array_elements(COALESCE(p_attachments, '[]'::jsonb)) LOOP
    IF a->>'path' IS NULL OR left(a->>'path', 74) <> p_client::text || '/' || p_project::text || '/' THEN
      RAISE EXCEPTION 'invalid' USING ERRCODE = 'P0001';
    END IF;
    INSERT INTO portal.message_attachments (id, client_id, project_id, message_id, storage_path, mime, size_bytes, filename)
    VALUES ((a->>'id')::uuid, p_client, p_project, v_id, a->>'path', a->>'mime', (a->>'size')::integer,
            left(COALESCE(NULLIF(btrim(a->>'filename'), ''), 'priloha'), 120));
  END LOOP;

  -- Kdo píše, přečetl celé vlákno.
  INSERT INTO portal.thread_state (project_id, client_id, side, last_read_at, last_read_member, last_seen_at)
  VALUES (p_project, p_client, p_author, now(), p_member, now())
  ON CONFLICT (project_id, side) DO UPDATE
    SET last_read_at = now(), last_read_member = EXCLUDED.last_read_member, last_seen_at = now();
  RETURN v_id;
END
$$;

-- Klient: text nebo přepsaný hlas, nejvýš 30 zpráv za hodinu a 30 příloh za den na člena.
CREATE OR REPLACE FUNCTION portal.post_message(
  p_project uuid, p_member uuid, p_kind text, p_body text, p_reply_to uuid, p_attachments jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, portal AS $$
DECLARE
  cid uuid := portal.assert_member_project(p_project, p_member);
  v_name text;
BEGIN
  IF p_kind NOT IN ('text', 'voice') THEN
    RAISE EXCEPTION 'invalid' USING ERRCODE = 'P0001';
  END IF;
  IF (SELECT count(*) FROM portal.messages m
      WHERE m.member_id = p_member AND m.author = 'client' AND m.created_at > now() - interval '1 hour') >= 30 THEN
    RAISE EXCEPTION 'rate_limited' USING ERRCODE = 'P0429';
  END IF;
  IF jsonb_typeof(p_attachments) = 'array' AND jsonb_array_length(p_attachments) > 0 AND (
    SELECT count(*) FROM portal.message_attachments ma JOIN portal.messages m ON m.id = ma.message_id
    WHERE m.member_id = p_member AND ma.created_at > now() - interval '1 day'
  ) + jsonb_array_length(p_attachments) > 30 THEN
    RAISE EXCEPTION 'rate_limited' USING ERRCODE = 'P0429';
  END IF;
  SELECT COALESCE(NULLIF(btrim(m.name), ''), split_part(m.email, '@', 1)) INTO v_name
  FROM portal.members m WHERE m.id = p_member;
  RETURN portal.insert_message(cid, p_project, 'client', p_member, v_name, p_kind, p_body, p_reply_to, NULL, p_attachments);
END
$$;

-- Admin (vlastník tabulek): text, hlas nebo zpráva ke schválení.
CREATE OR REPLACE FUNCTION public.portal_admin_post(
  p_project uuid, p_kind text, p_body text, p_reply_to uuid, p_approval_url text, p_attachments jsonb, p_author_name text
) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  cid uuid;
BEGIN
  SELECT pp.client_id INTO cid FROM portal.projects pp WHERE pp.id = p_project;
  IF cid IS NULL THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;
  IF p_kind NOT IN ('text', 'voice', 'approval') OR (p_kind <> 'approval' AND p_approval_url IS NOT NULL) THEN
    RAISE EXCEPTION 'invalid' USING ERRCODE = 'P0001';
  END IF;
  RETURN portal.insert_message(cid, p_project, 'admin', NULL, p_author_name, p_kind, p_body, p_reply_to, p_approval_url, p_attachments);
END
$$;

-- Klient odpoví na zprávu ke schválení: jednou, „Schvaluji", nebo „Chci změny" s textem.
CREATE OR REPLACE FUNCTION portal.answer_approval(p_message uuid, p_member uuid, p_decision text, p_body text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, portal AS $$
DECLARE
  cid uuid := portal.current_client();
  m record;
  v_name text;
  v_body text := btrim(COALESCE(p_body, ''));
BEGIN
  SELECT x.id, x.project_id, x.approval_state INTO m
  FROM portal.messages x
  WHERE x.id = p_message AND x.client_id = cid AND x.kind = 'approval'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;
  PERFORM portal.assert_member_project(m.project_id, p_member);
  IF p_decision NOT IN ('approved', 'changes') OR (p_decision = 'changes' AND char_length(v_body) < 3) THEN
    RAISE EXCEPTION 'invalid' USING ERRCODE = 'P0001';
  END IF;
  IF m.approval_state <> 'pending' THEN
    RAISE EXCEPTION 'already_answered' USING ERRCODE = 'P0409';
  END IF;

  UPDATE portal.messages SET approval_state = p_decision, updated_at = now() WHERE id = m.id;
  SELECT COALESCE(NULLIF(btrim(mm.name), ''), split_part(mm.email, '@', 1)) INTO v_name
  FROM portal.members mm WHERE mm.id = p_member;
  RETURN portal.insert_message(
    cid, m.project_id, 'client', p_member, v_name, 'approval_answer',
    CASE WHEN p_decision = 'approved' THEN COALESCE(NULLIF(v_body, ''), 'Schvaluji.') ELSE v_body END,
    m.id, NULL, NULL
  );
END
$$;

-- Klient má vlákno otevřené (každých 10 s): poslední návštěva, a když je karta
-- vidět, i přečteno.
CREATE OR REPLACE FUNCTION portal.touch_thread(p_project uuid, p_member uuid, p_read boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, portal AS $$
DECLARE
  cid uuid := portal.assert_member_project(p_project, p_member);
BEGIN
  INSERT INTO portal.thread_state (project_id, client_id, side, last_seen_at, last_read_at, last_read_member)
  VALUES (p_project, cid, 'client', now(), CASE WHEN p_read THEN now() END, CASE WHEN p_read THEN p_member END)
  ON CONFLICT (project_id, side) DO UPDATE
    SET last_seen_at = now(),
        last_read_at = CASE WHEN p_read THEN now() ELSE portal.thread_state.last_read_at END,
        last_read_member = CASE WHEN p_read THEN p_member ELSE portal.thread_state.last_read_member END;
END
$$;

CREATE OR REPLACE FUNCTION public.portal_admin_touch(p_project uuid, p_read boolean)
RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  cid uuid;
BEGIN
  SELECT pp.client_id INTO cid FROM portal.projects pp WHERE pp.id = p_project;
  IF cid IS NULL THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO portal.thread_state (project_id, client_id, side, last_seen_at, last_read_at)
  VALUES (p_project, cid, 'admin', now(), CASE WHEN p_read THEN now() END)
  ON CONFLICT (project_id, side) DO UPDATE
    SET last_seen_at = now(),
        last_read_at = CASE WHEN p_read THEN now() ELSE portal.thread_state.last_read_at END;
END
$$;

-- Upozornění e-mailem druhé straně: jen když vlákno nemá otevřené (poslední
-- návštěva před víc než minutou) a nejvýš jednou za hodinu. Vrací true, když
-- se má poslat; zámek a zápis jedním příkazem.
CREATE OR REPLACE FUNCTION public.portal_thread_claim_notify(p_project uuid, p_side text)
RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  cid uuid;
  v_ok boolean;
BEGIN
  SELECT pp.client_id INTO cid FROM portal.projects pp WHERE pp.id = p_project;
  IF cid IS NULL OR p_side NOT IN ('client', 'admin') THEN
    RETURN false;
  END IF;
  INSERT INTO portal.thread_state AS t (project_id, client_id, side, last_notified_at)
  VALUES (p_project, cid, p_side, now())
  ON CONFLICT (project_id, side) DO UPDATE
    SET last_notified_at = now()
    WHERE (t.last_seen_at IS NULL OR t.last_seen_at < now() - interval '1 minute')
      AND (t.last_notified_at IS NULL OR t.last_notified_at < now() - interval '1 hour')
  RETURNING true INTO v_ok;
  RETURN COALESCE(v_ok, false);
END
$$;

-- Příloha pro stažení: jen klientovi, kterému patří, a jen platnému členovi.
CREATE OR REPLACE FUNCTION portal.attachment_file(p_attachment uuid, p_member uuid)
RETURNS TABLE (storage_path text, mime text, filename text, size_bytes integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, portal AS $$
DECLARE
  cid uuid := portal.current_client();
  v_project uuid;
BEGIN
  SELECT a.project_id INTO v_project FROM portal.message_attachments a WHERE a.id = p_attachment AND a.client_id = cid;
  IF v_project IS NULL THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;
  PERFORM portal.assert_member_project(v_project, p_member);
  RETURN QUERY
    SELECT a.storage_path, a.mime, a.filename, a.size_bytes FROM portal.message_attachments a WHERE a.id = p_attachment;
END
$$;

-- ─── 5. Stav zadání u zprávy sleduje práci admina ────────────────────────────
-- Tělo z migrace 096 + řádek pro zprávy z chatu.

CREATE OR REPLACE FUNCTION portal.sync_request_status() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, portal, public AS $$
BEGIN
  UPDATE portal.requests SET status = NEW.status WHERE admin_request_id = NEW.id;
  UPDATE portal.messages SET request_status = NEW.status, updated_at = now()
  WHERE admin_request_id = NEW.id AND request_status IS DISTINCT FROM NEW.status;
  RETURN NEW;
END
$$;

-- ─── 6. Kdo smí co spustit ───────────────────────────────────────────────────

REVOKE ALL ON FUNCTION portal.queue_attachment_deletion() FROM PUBLIC;
REVOKE ALL ON FUNCTION portal.insert_message(uuid, uuid, text, uuid, text, text, text, uuid, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION portal.post_message(uuid, uuid, text, text, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.portal_admin_post(uuid, text, text, uuid, text, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION portal.answer_approval(uuid, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION portal.touch_thread(uuid, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.portal_admin_touch(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.portal_thread_claim_notify(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION portal.attachment_file(uuid, uuid) FROM PUBLIC;
