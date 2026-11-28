-- Migrace 144: „Vrátit" u zrušené konzultace nevynuluje počet přesunů (R-156)
--
-- Klient smí jednu konzultaci přesunout nejvýš pětkrát (`move_count`, migrace
-- 123) a rezervovat nejvýš 10 konzultací za hodinu. Zrušení ale rezervaci
-- maže, takže:
--   - „Vrátit" po zrušení udělá novou rezervaci s `move_count = 0` a strop
--     pěti přesunů jde obejít (zrušit → Vrátit → dalších pět přesunů),
--   - smazaná rezervace se nepočítá do limitu 10 za hodinu, takže smyčka
--     rezervovat → zrušit nemá strop (každé kolo zakládá a maže Google Meet).
--
-- Oprava: zrušení si na hodinu zapamatuje zakázku a počet přesunů
-- (`consultation_cancellations`, bez osobních údajů — jen zakázka, číslo
-- a čas). Nová rezervace téže zakázky do 15 minut po zrušení převezme počet
-- přesunů a zrušení z poslední hodiny se počítají do limitu rezervací.
-- Řádky starší než den se mažou při každém zrušení.
--
-- Těla `portal.book_consultation` a `portal.cancel_consultation` jsou z 123
-- s těmito doplňky; podpisy se nemění, práva `portal_app` zůstávají.

CREATE TABLE IF NOT EXISTS public.consultation_cancellations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  move_count integer NOT NULL DEFAULT 0 CHECK (move_count >= 0),
  cancelled_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS consultation_cancellations_project_idx
  ON public.consultation_cancellations (project_id, cancelled_at);

CREATE OR REPLACE FUNCTION portal.book_consultation(p_project uuid, p_member uuid, p_starts_at timestamptz, p_topic text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, portal, public AS $$
DECLARE
  cid uuid := portal.assert_member_project(p_project, p_member);
  v_email text;
  v_id uuid;
  v_moves integer;
BEGIN
  IF p_starts_at IS NULL OR p_topic IS NULL OR char_length(btrim(p_topic)) NOT BETWEEN 3 AND 1000 THEN
    RAISE EXCEPTION 'invalid' USING ERRCODE = 'P0001';
  END IF;
  IF (SELECT count(*) FROM public.consultation_slots cs
      WHERE cs.portal_member_id = p_member AND cs.created_at > now() - interval '1 hour')
     + (SELECT count(*) FROM public.consultation_cancellations cc
        WHERE cc.project_id = p_project AND cc.cancelled_at > now() - interval '1 hour') >= 10 THEN
    RAISE EXCEPTION 'rate_limited' USING ERRCODE = 'P0429';
  END IF;
  SELECT m.email INTO v_email FROM portal.members m WHERE m.id = p_member AND m.client_id = cid;
  v_id := public.consultation_book(p_project, p_starts_at, 'meet', NULL, btrim(p_topic), v_email, NULL, 'prostor', p_member);

  SELECT max(cc.move_count) INTO v_moves FROM public.consultation_cancellations cc
  WHERE cc.project_id = p_project AND cc.cancelled_at > now() - interval '15 minutes';
  IF coalesce(v_moves, 0) > 0 THEN
    UPDATE public.consultation_slots SET move_count = v_moves WHERE id = v_id;
  END IF;
  RETURN v_id;
END
$$;

CREATE OR REPLACE FUNCTION portal.cancel_consultation(p_consultation uuid, p_member uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, portal, public AS $$
DECLARE
  v_project uuid := portal.assert_changeable_consultation(p_consultation, p_member);
BEGIN
  DELETE FROM public.consultation_cancellations WHERE cancelled_at < now() - interval '1 day';
  INSERT INTO public.consultation_cancellations (project_id, move_count)
  SELECT v_project, cs.move_count FROM public.consultation_slots cs WHERE cs.id = p_consultation;
  RETURN public.consultation_cancel(p_consultation);
END
$$;

REVOKE ALL ON TABLE public.consultation_cancellations FROM PUBLIC;
REVOKE ALL ON FUNCTION portal.book_consultation(uuid, uuid, timestamptz, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION portal.cancel_consultation(uuid, uuid) FROM PUBLIC;
