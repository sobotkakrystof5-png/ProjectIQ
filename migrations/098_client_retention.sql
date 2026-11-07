-- 098: Retence dat klientů po dokončené zakázce (D-K10, R-076).
--
-- Dokončená zakázka (stav done nebo paid), na které se 3 roky nic nestalo
-- (žádná změna zakázky, aktivita, požadavek ani zpráva), přijde o obsah od
-- klienta a pro klienta: aktivita (trigger z 095 smaže i portal.activity),
-- požadavky, zprávy a slovní hodnocení. Zakázka sama, cena, platby a číselné
-- hodnocení zůstávají (účetnictví, přehledy). Pozvánky do klientského prostoru
-- se mažou 90 dní po použití, zrušení nebo vypršení.
--
-- Spouští denní cron /api/cron/client-retention rolí vlastníka tabulek.
-- portal_app ani nikdo jiný funkci spustit nesmí. Idempotentní.

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

  IF v_has_portal THEN
    DELETE FROM portal.requests WHERE project_id = ANY (v_projects);
    GET DIAGNOSTICS v_portal_requests = ROW_COUNT;
    DELETE FROM portal.messages WHERE project_id = ANY (v_projects);
    GET DIAGNOSTICS v_messages = ROW_COUNT;
    UPDATE portal.feedback SET content = NULL WHERE project_id = ANY (v_projects) AND content IS NOT NULL;
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
    'feedback_texts', v_feedback,
    'invites', v_invites
  );
END
$$;

REVOKE ALL ON FUNCTION public.purge_client_retention(integer) FROM PUBLIC;
