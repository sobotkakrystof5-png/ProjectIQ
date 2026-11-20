-- 127: GDPR v klientském prostoru (KP10, R-131). Idempotentní.
--
-- 1. public.portal_export_member(member) — všechno, co o členovi klienta víme,
--    jako jeden JSON (žádost o přístup, čl. 15 GDPR).
-- 2. public.portal_erase_member(member, keep_messages) — výmaz na žádost
--    (čl. 17): pozvánky na jeho e-mail, jeho zprávy v chatu i s přílohami
--    (soubory jdou do fronty storage_deletions, smaže je cron), požadavky,
--    hodnocení, značky úkolů, téma a e-mail jeho konzultací a nakonec člen.
--    Vrátí id účtu v Supabase Auth, který pak smaže skript (scripts/portal-gdpr.mjs).
--    keep_messages = true nechá text zpráv firmě a zahodí jen jméno autora.
-- 3. purge_client_retention (098) navíc maže téma konzultací, slovní části
--    dotazníku (R-119) a stav čtení vláken u zakázek po lhůtě (R-076).
--
-- Funkce spouští jen vlastník tabulek (skript, cron). portal_app ne.

-- ─── 1. Export ───────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.portal_export_member(p_member uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = pg_catalog, public AS $$
DECLARE
  m record;
BEGIN
  SELECT pm.*, c.name AS client_name INTO m
  FROM portal.members pm JOIN portal.clients c ON c.id = pm.client_id
  WHERE pm.id = p_member;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'vytvoreno', now(),
    'clen', jsonb_build_object(
      'email', m.email, 'jmeno', m.name, 'role', m.role, 'firma', m.client_name,
      'clenem_od', m.created_at, 'odebran', m.removed_at
    ),
    'pozvanky', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('email', i.email, 'vytvorena', i.created_at, 'plati_do', i.expires_at,
                                          'pouzita', i.used_at, 'zrusena', i.revoked_at) ORDER BY i.created_at)
      FROM portal.invites i
      WHERE i.used_by = p_member OR (m.email IS NOT NULL AND lower(i.email) = lower(m.email))
    ), '[]'::jsonb),
    'zpravy', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'zakazka', pp.name, 'kdy', msg.created_at, 'druh', msg.kind, 'text', msg.body,
               'prilohy', COALESCE((SELECT jsonb_agg(jsonb_build_object('soubor', a.filename, 'typ', a.mime, 'velikost', a.size_bytes))
                                    FROM portal.message_attachments a WHERE a.message_id = msg.id), '[]'::jsonb))
             ORDER BY msg.created_at)
      FROM portal.messages msg JOIN portal.projects pp ON pp.id = msg.project_id
      WHERE msg.member_id = p_member
    ), '[]'::jsonb),
    'pozadavky', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('zakazka', pp.name, 'kdy', r.created_at, 'text', r.body, 'stav', r.status) ORDER BY r.created_at)
      FROM portal.requests r JOIN portal.projects pp ON pp.id = r.project_id
      WHERE r.member_id = p_member
    ), '[]'::jsonb),
    'hodnoceni', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('zakazka', pp.name, 'kdy', f.created_at, 'znamka', f.nps, 'text', f.content))
      FROM portal.feedback f JOIN portal.projects pp ON pp.id = f.project_id
      WHERE f.member_id = p_member
    ), '[]'::jsonb),
    'konzultace', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('kdy', cs.scheduled_at, 'tema', cs.client_wish, 'email', cs.client_email) ORDER BY cs.scheduled_at)
      FROM public.consultation_slots cs
      WHERE cs.portal_member_id = p_member
    ), '[]'::jsonb),
    'ukoly', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('ukol', t.body, 'hotovo', tm.done, 'kdy', tm.created_at) ORDER BY tm.created_at)
      FROM portal.task_marks tm LEFT JOIN public.project_phase_tasks t ON t.id = tm.task_id
      WHERE tm.member_id = p_member
    ), '[]'::jsonb)
  );
END
$$;

REVOKE ALL ON FUNCTION public.portal_export_member(uuid) FROM PUBLIC;

-- ─── 2. Výmaz na žádost ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.portal_erase_member(p_member uuid, p_keep_messages boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
  m record;
  v_email text;
  v_messages integer := 0;
  v_attachments integer := 0;
  v_admin_requests integer := 0;
  v_invites integer := 0;
  v_consultations integer := 0;
  v_others integer := 0;
BEGIN
  SELECT * INTO m FROM portal.members WHERE id = p_member FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;
  v_email := lower(m.email);

  -- Zadání pro Claude Code a kopie požadavků v adminu, které vznikly z jeho textu.
  DELETE FROM public.client_requests cr
  WHERE cr.id IN (
    SELECT r.admin_request_id FROM portal.requests r WHERE r.member_id = p_member AND r.admin_request_id IS NOT NULL
    UNION
    SELECT msg.admin_request_id FROM portal.messages msg
    WHERE msg.member_id = p_member AND msg.admin_request_id IS NOT NULL AND NOT p_keep_messages
  );
  GET DIAGNOSTICS v_admin_requests = ROW_COUNT;

  IF p_keep_messages THEN
    UPDATE portal.messages SET author_name = NULL WHERE member_id = p_member;
  ELSE
    SELECT count(*) INTO v_attachments
    FROM portal.message_attachments a JOIN portal.messages msg ON msg.id = a.message_id
    WHERE msg.member_id = p_member;
    -- Odpovědi na tyto zprávy přijdou jen o citaci (reply_to ON DELETE SET NULL).
    DELETE FROM portal.messages WHERE member_id = p_member;
    GET DIAGNOSTICS v_messages = ROW_COUNT;
  END IF;

  UPDATE public.consultation_slots
  -- client_wish je NOT NULL (migrace 001): prázdný text.
  SET client_wish = '', client_email = NULL, portal_member_id = NULL
  WHERE portal_member_id = p_member;
  GET DIAGNOSTICS v_consultations = ROW_COUNT;

  UPDATE public.project_phase_tasks SET client_done_by = NULL WHERE client_done_by = p_member;

  DELETE FROM portal.invites
  WHERE used_by = p_member OR (v_email IS NOT NULL AND lower(email) = v_email);
  GET DIAGNOSTICS v_invites = ROW_COUNT;

  -- Požadavky, hodnocení a značky úkolů padnou kaskádou; zbylé odkazy na člena
  -- (stav čtení vlákna, projekce konzultace) se vynulují.
  DELETE FROM portal.members WHERE id = p_member;

  -- Stejný účet Supabase může být členem i jinde — pak se účet nemaže.
  SELECT count(*) INTO v_others FROM portal.members WHERE clerk_user_id = m.clerk_user_id;

  RETURN jsonb_build_object(
    'auth_user_id', m.clerk_user_id,
    'auth_user_used_elsewhere', v_others > 0,
    'messages', v_messages,
    'attachments', v_attachments,
    'admin_requests', v_admin_requests,
    'invites', v_invites,
    'consultations', v_consultations
  );
END
$$;

REVOKE ALL ON FUNCTION public.portal_erase_member(uuid, boolean) FROM PUBLIC;

-- ─── 3. Retence (R-076) doplněná o data z KP14–KP16 ──────────────────────────

CREATE OR REPLACE FUNCTION public.purge_client_retention(p_years integer DEFAULT 3)
RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  v_cutoff timestamptz;
  v_has_portal boolean := to_regclass('portal.messages') IS NOT NULL;
  v_projects uuid[];
  v_activity integer := 0;
  v_requests integer := 0;
  v_feedback integer := 0;
  v_portal_requests integer := 0;
  v_messages integer := 0;
  v_invites integer := 0;
  v_topics integer := 0;
  v_survey_texts integer := 0;
BEGIN
  IF p_years IS NULL OR p_years < 1 THEN
    RAISE EXCEPTION 'retence musí být aspoň 1 rok';
  END IF;
  v_cutoff := now() - make_interval(years => p_years);

  SELECT COALESCE(array_agg(p.id), '{}') INTO v_projects
  FROM public.projects p
  WHERE p.status IN ('done', 'paid')
    AND COALESCE(p.updated_at, p.created_at) < v_cutoff
    AND NOT EXISTS (SELECT 1 FROM public.project_activity a
                    WHERE a.project_id = p.id AND GREATEST(a.created_at, a.updated_at, a.published_at) >= v_cutoff)
    AND NOT EXISTS (SELECT 1 FROM public.client_requests r
                    WHERE r.project_id = p.id AND r.created_at >= v_cutoff);

  IF v_has_portal THEN
    SELECT COALESCE(array_agg(t.pid), '{}') INTO v_projects
    FROM unnest(v_projects) AS t(pid)
    WHERE NOT EXISTS (SELECT 1 FROM portal.messages m WHERE m.project_id = t.pid AND m.created_at >= v_cutoff)
      AND NOT EXISTS (SELECT 1 FROM portal.requests r WHERE r.project_id = t.pid AND r.created_at >= v_cutoff);
  END IF;

  DELETE FROM public.project_activity WHERE project_id = ANY (v_projects);
  GET DIAGNOSTICS v_activity = ROW_COUNT;
  DELETE FROM public.client_requests WHERE project_id = ANY (v_projects);
  GET DIAGNOSTICS v_requests = ROW_COUNT;
  UPDATE public.client_feedback SET content = NULL WHERE project_id = ANY (v_projects) AND content IS NOT NULL;
  GET DIAGNOSTICS v_feedback = ROW_COUNT;

  -- Téma konzultace napsal klient (KP14); čas a délka zůstávají kvůli přehledům.
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'consultation_slots' AND column_name = 'client_wish') THEN
    UPDATE public.consultation_slots SET client_wish = ''
    WHERE project_id = ANY (v_projects) AND client_wish <> '' AND scheduled_at < v_cutoff;
    GET DIAGNOSTICS v_topics = ROW_COUNT;
  END IF;

  -- Slovní části dotazníku (R-119); známky zůstávají v přehledech NPS.
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'project_surveys' AND column_name = 'improve_text') THEN
    EXECUTE 'UPDATE public.project_surveys SET improve_text = NULL, reference_text = NULL
             WHERE project_id = ANY ($1) AND (improve_text IS NOT NULL OR reference_text IS NOT NULL)'
      USING v_projects;
    GET DIAGNOSTICS v_survey_texts = ROW_COUNT;
  END IF;

  IF v_has_portal THEN
    DELETE FROM portal.requests WHERE project_id = ANY (v_projects);
    GET DIAGNOSTICS v_portal_requests = ROW_COUNT;
    DELETE FROM portal.messages WHERE project_id = ANY (v_projects);
    GET DIAGNOSTICS v_messages = ROW_COUNT;
    UPDATE portal.feedback SET content = NULL WHERE project_id = ANY (v_projects) AND content IS NOT NULL;
    IF to_regclass('portal.thread_state') IS NOT NULL THEN
      DELETE FROM portal.thread_state WHERE project_id = ANY (v_projects);
    END IF;
    DELETE FROM portal.invites
    WHERE COALESCE(used_at, revoked_at, expires_at) < now() - interval '90 days'
      AND (used_at IS NOT NULL OR revoked_at IS NOT NULL OR expires_at < now());
    GET DIAGNOSTICS v_invites = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'projects', cardinality(v_projects),
    'activity', v_activity,
    'requests', v_requests + v_portal_requests,
    'messages', v_messages,
    'feedback_texts', v_feedback + v_survey_texts,
    'invites', v_invites,
    'consultation_topics', v_topics
  );
END
$$;

REVOKE ALL ON FUNCTION public.purge_client_retention(integer) FROM PUBLIC;
