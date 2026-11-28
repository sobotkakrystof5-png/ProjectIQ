-- Migrace 143: pozvání čerstvé zakázky a název zakázky v klientském prostoru (R-156)
--
-- 1. Pozvání zakázky, kterou ještě nikdo neuložil, padalo. `portal.link_project`
--    kopíruje `projects.updated_at` do `portal.projects.updated_at` (NOT NULL),
--    jenže žádný INSERT do `projects` čas úpravy nenastavuje a sloupec neměl
--    výchozí hodnotu. Nová zakázka tedy měla NULL a pozvání skončilo chybou
--    23502, dokud ji někdo jednou neuložil. Totéž by potkalo i trigger
--    `portal.sync_project`, kdyby se propojené zakázce čas úpravy vynuloval.
--    Oprava: výchozí `now()` pro nové zakázky a `coalesce` při kopírování.
--    Existující řádky se **nepřepisují** — UPDATE nad `projects` by spustil
--    triggery kontaktů a peněz; `coalesce` stačí.
--
-- 2. Zakázka se u klienta jmenovala jménem jeho firmy (`client_name`), takže
--    dvě zakázky jedné firmy nešly rozeznat. Nově „firma · druh práce"
--    (`service_type`); bez druhu práce zůstává jméno firmy.
--
-- Těla `link_project` (095 → 121 → 122) a `sync_project` (095) jsou převzatá
-- beze změny až na název a čas úpravy.

-- ─── 1. Výchozí čas úpravy pro nové zakázky ──────────────────────────────────

ALTER TABLE public.projects ALTER COLUMN updated_at SET DEFAULT now();

-- ─── 2. Název zakázky pro klienta ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION portal.project_display_name(p_client_name text, p_service_type text)
RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT CASE
    WHEN nullif(btrim(coalesce(p_service_type, '')), '') IS NULL THEN p_client_name
    ELSE p_client_name || ' · ' || btrim(p_service_type)
  END
$$;

-- ─── 3. Propojení zakázky s klientem ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION portal.link_project(p_client uuid, p_project uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, portal, public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM portal.projects WHERE id = p_project AND client_id <> p_client) THEN
    RAISE EXCEPTION 'Zakázka už patří jinému klientovi.' USING ERRCODE = '23505';
  END IF;

  INSERT INTO portal.projects (id, client_id, name, description, status, progress, deadline, project_url, updated_at)
  SELECT p.id, p_client, portal.project_display_name(p.client_name, p.service_type), p.description, p.status,
         p.progress, p.deadline, p.project_url, coalesce(p.updated_at, now())
  FROM public.projects p WHERE p.id = p_project
  ON CONFLICT (id) DO NOTHING;
  IF NOT FOUND AND NOT EXISTS (SELECT 1 FROM portal.projects WHERE id = p_project) THEN
    RAISE EXCEPTION 'Zakázka neexistuje.' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO portal.activity (id, client_id, project_id, kind, title, body, published_at)
  SELECT a.id, p_client, a.project_id, a.kind, a.title, a.body, a.published_at
  FROM public.project_activity a
  WHERE a.project_id = p_project AND a.status = 'published' AND a.published_at IS NOT NULL
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO portal.phases (id, client_id, project_id, position, name, description, due_date, status, done_at)
  SELECT ph.id, p_client, ph.project_id, ph.position, ph.name, ph.client_description, ph.due_date, ph.status, ph.done_at
  FROM public.project_phases ph WHERE ph.project_id = p_project
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO portal.phase_tasks (id, client_id, project_id, phase_id, position, body, done_at)
  SELECT t.id, p_client, t.project_id, t.phase_id, t.position, t.body, t.client_done_at
  FROM public.project_phase_tasks t WHERE t.project_id = p_project
  ON CONFLICT (id) DO NOTHING;

  PERFORM portal.put_invoice(i.id) FROM public.invoices i WHERE i.project_id = p_project;
  PERFORM portal.refresh_project_money(p_project);
END
$$;

-- ─── 4. Změna zakázky v adminu ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION portal.sync_project() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, portal, public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM portal.projects WHERE id = OLD.id;
    RETURN OLD;
  END IF;
  UPDATE portal.projects
  SET name = portal.project_display_name(NEW.client_name, NEW.service_type), description = NEW.description,
      status = NEW.status, progress = NEW.progress, deadline = NEW.deadline, project_url = NEW.project_url,
      updated_at = coalesce(NEW.updated_at, now())
  WHERE id = NEW.id;
  RETURN NEW;
END
$$;

-- ─── 5. Nový název pro zakázky, které už s klientem propojené jsou ───────────
-- Mění se jen projekce v `portal`, `public.projects` zůstává, jak je.

UPDATE portal.projects pp
SET name = portal.project_display_name(p.client_name, p.service_type)
FROM public.projects p
WHERE p.id = pp.id
  AND pp.name IS DISTINCT FROM portal.project_display_name(p.client_name, p.service_type);

REVOKE ALL ON FUNCTION portal.project_display_name(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION portal.link_project(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION portal.sync_project() FROM PUBLIC;
