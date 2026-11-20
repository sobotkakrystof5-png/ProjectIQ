-- 125 · Přehled klienta (KP16, R-121, R-123, R-128)
--
-- 1) E-mail klientovi, když Kryštof dokončí etapu — souhrnně, nejvýš jednou
--    za 24 hodin na zakázku (jako zprávy o práci, R-072). Která etapa už
--    v e-mailu byla, drží project_phases.client_notified_at; kdy odešel
--    poslední e-mail, drží project_phase_emails. Zabrání dělá jedna funkce
--    se zámkem řádku (ON CONFLICT), takže souběžné dokončení dvou etap
--    nepošle dva e-maily.
-- 2) Hodnocení v klientském prostoru přes dotazník R-119. Úzká funkce vrátí
--    členovi token dotazníku jeho hotových zakázek; odpověď pak jde stejnou
--    cestou jako z e-mailu (/h/<token>) do project_surveys, jedna na zakázku.
--
-- Závisí na 095 (portal), 106 (projects.survey_token, project_type),
-- 107 (admin_settings), 118 (project_surveys.nps, completed_at) a 121 (etapy).
-- Idempotentní: druhý běh nic nezmění. Aplikace bez téhle migrace běží dál,
-- jen e-mail o etapách neodchází a hodnocení se v prostoru nenabídne.

-- ─── 1. E-mail o dokončené etapě ────────────────────────────────────────────

-- Sloupec se zakládá spolu s doplněním: etapy hotové před migrací klient zná
-- z prostoru, e-mail o nich neodejde. Druhý běh migrace už nic nedoplní, takže
-- nezatají etapu dokončenou mezi oběma běhy.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'project_phases' AND column_name = 'client_notified_at'
  ) THEN
    ALTER TABLE public.project_phases ADD COLUMN client_notified_at timestamptz;
    UPDATE public.project_phases SET client_notified_at = coalesce(done_at, now()) WHERE status = 'done';
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.project_phase_emails (
  project_id uuid PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  sent_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS project_phases_unnotified_idx
  ON public.project_phases (project_id) WHERE status = 'done' AND client_notified_at IS NULL;

-- Zabere etapy k e-mailu. Vrátí nic, když zakázka není v klientském prostoru,
-- nemá nenahlášenou hotovou etapu, nebo už e-mail odešel za posledních 24 h.
-- Volá jen admin (vlastník tabulek); portal_app na ni nemá právo.
CREATE OR REPLACE FUNCTION public.portal_phase_email_claim(p_project uuid)
RETURNS TABLE (phase_id uuid, name text, phase_position integer, stamp timestamptz)
LANGUAGE plpgsql SET search_path = pg_catalog, public, portal AS $$
DECLARE
  claimed_at timestamptz;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM portal.projects pp WHERE pp.id = p_project) THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.project_phases ph
    WHERE ph.project_id = p_project AND ph.status = 'done' AND ph.client_notified_at IS NULL
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.project_phase_emails AS e (project_id, sent_at)
  VALUES (p_project, now())
  ON CONFLICT (project_id) DO UPDATE SET sent_at = EXCLUDED.sent_at
    WHERE e.sent_at <= now() - interval '24 hours'
  RETURNING e.sent_at INTO claimed_at;
  IF claimed_at IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  UPDATE public.project_phases ph SET client_notified_at = claimed_at
  WHERE ph.project_id = p_project AND ph.status = 'done' AND ph.client_notified_at IS NULL
  RETURNING ph.id, ph.name, ph.position, claimed_at;
END
$$;

-- Vrátí zabrání, když e-mail neodešel — příště se zkusí znovu.
CREATE OR REPLACE FUNCTION public.portal_phase_email_release(p_project uuid, p_stamp timestamptz)
RETURNS void
LANGUAGE sql SET search_path = pg_catalog, public AS $$
  UPDATE public.project_phases SET client_notified_at = NULL
  WHERE project_id = p_project AND client_notified_at = p_stamp;
  DELETE FROM public.project_phase_emails WHERE project_id = p_project AND sent_at = p_stamp;
$$;

REVOKE ALL ON FUNCTION public.portal_phase_email_claim(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.portal_phase_email_release(uuid, timestamptz) FROM PUBLIC;

-- ─── 2. Hodnocení přes dotazník R-119 ───────────────────────────────────────

-- Hotové zakázky klienta s tokenem dotazníku a stavem odpovědi. Člen musí
-- patřit klientovi z app.client_id. Token je tentýž, který klient dostal
-- v e-mailu s dotazníkem — nic dalšího nezpřístupňuje.
CREATE OR REPLACE FUNCTION portal.client_surveys(p_member uuid)
RETURNS TABLE (project_id uuid, survey_token uuid, nps integer, completed boolean, google_review_url text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, portal, public AS $$
DECLARE
  cid uuid := portal.current_client();
BEGIN
  IF cid IS NULL OR NOT EXISTS (
    SELECT 1 FROM portal.members m WHERE m.id = p_member AND m.client_id = cid AND m.removed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;

  RETURN QUERY
  SELECT pp.id,
         pr.survey_token,
         s.nps::integer,
         (s.completed_at IS NOT NULL),
         (SELECT NULLIF(btrim(to_jsonb(a) ->> 'google_review_url'), '') FROM public.admin_settings a WHERE a.id = true LIMIT 1)
  FROM portal.projects pp
  JOIN public.projects pr ON pr.id = pp.id
  LEFT JOIN public.project_surveys s ON s.project_id = pr.id
  WHERE pp.client_id = cid
    AND pr.status IN ('done', 'paid')
    AND pr.survey_token IS NOT NULL
    AND NOT coalesce((to_jsonb(pr) ->> 'lead_pending')::boolean, false)
    AND coalesce(to_jsonb(pr) ->> 'project_type', 'client') = 'client';
END
$$;

REVOKE ALL ON FUNCTION portal.client_surveys(uuid) FROM PUBLIC;
