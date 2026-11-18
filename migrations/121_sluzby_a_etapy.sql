-- Migrace 121: služby, šablony etap a etapy zakázky (KP12, R-121, D-K14)
--
-- Co přibývá:
--   1. Číselník služeb (`service_templates`) a k ní šablony etap
--      (`service_phase_templates`) s popisem pro klienta, typickou délkou ve dnech
--      a úkoly pro klienta. Obsah píše Kryštof v Nastavení › Služby.
--   2. Etapy zakázky (`project_phases`) a úkoly klienta (`project_phase_tasks`).
--      Při založení zakázky se ze šablony **kopírují** — úprava šablony běžící
--      zakázky nemění. Stávající texty `projects.service_type` se nepřevádějí.
--   3. Postup zakázky v % se počítá z hotových etap (D-K14): trigger přepíše
--      `projects.progress`, jakmile má zakázka aspoň jednu etapu. Zakázka bez
--      etap si nechá ruční %.
--   4. Projekce do klientského prostoru: `portal.phases`, `portal.phase_tasks`
--      triggerem jen u zakázky propojené s klientem (jako 095). Klient smí jen
--      označit svůj úkol „Mám hotovo" funkcí `portal.submit_task_state`
--      (členství, limit 60 změn za hodinu, záznam v `portal.task_marks`).
--
-- Po migraci pustit `node scripts/portal-create-role.js` (práva z
-- `scripts/portal-grants.sql`), jinak klient etapy neuvidí.
-- Vyžaduje migrace 095 a 096. Idempotentní.

-- ─── 1. Služby a šablony etap ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.service_templates (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  position integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS service_templates_name_unique
  ON public.service_templates (lower(btrim(name)));

CREATE TABLE IF NOT EXISTS public.service_phase_templates (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  service_id uuid NOT NULL REFERENCES public.service_templates(id) ON DELETE CASCADE,
  position integer NOT NULL,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  client_description text CHECK (client_description IS NULL OR char_length(client_description) <= 1000),
  typical_days integer CHECK (typical_days IS NULL OR typical_days BETWEEN 0 AND 365),
  -- Úkoly pro klienta (dodat texty, fotky, schválit návrh). Délku jednoho
  -- úkolu hlídá Zod (300 znaků); tady jen strop počtu a celku.
  client_tasks text[] NOT NULL DEFAULT '{}'
    CHECK (cardinality(client_tasks) <= 20 AND char_length(array_to_string(client_tasks, '')) <= 6000)
);
CREATE INDEX IF NOT EXISTS service_phase_templates_service_idx
  ON public.service_phase_templates (service_id, position);

-- ─── 2. Etapy a úkoly zakázky ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.project_phases (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  position integer NOT NULL,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  client_description text CHECK (client_description IS NULL OR char_length(client_description) <= 1000),
  due_date date,
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'running', 'done')),
  done_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, id)
);
CREATE INDEX IF NOT EXISTS project_phases_project_idx ON public.project_phases (project_id, position);

CREATE TABLE IF NOT EXISTS public.project_phase_tasks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL,
  phase_id uuid NOT NULL,
  position integer NOT NULL,
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 300),
  -- Kdy a kdo z klientského prostoru úkol označil (portal.members.id, bez
  -- cizího klíče — jiné schéma). Zapisuje jen portal.submit_task_state.
  client_done_at timestamptz,
  client_done_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Složený klíč: úkol nemůže patřit etapě cizí zakázky.
  FOREIGN KEY (project_id, phase_id) REFERENCES public.project_phases (project_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS project_phase_tasks_phase_idx ON public.project_phase_tasks (phase_id, position);
CREATE INDEX IF NOT EXISTS project_phase_tasks_project_idx ON public.project_phase_tasks (project_id);

-- ─── 3. Postup v % z etap (D-K14) ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.project_phases_progress() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  pid uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.project_id ELSE NEW.project_id END;
  total integer;
  finished integer;
  pct integer;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE status = 'done')
  INTO total, finished
  FROM public.project_phases WHERE project_id = pid;
  -- Bez etap zůstává ruční % (stará zakázka, nebo smazané všechny etapy).
  IF total > 0 THEN
    pct := round(100.0 * finished / total);
    UPDATE public.projects SET progress = pct, updated_at = now()
    WHERE id = pid AND progress IS DISTINCT FROM pct;
  END IF;
  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS trg_project_phases_progress ON public.project_phases;
CREATE TRIGGER trg_project_phases_progress
  AFTER INSERT OR UPDATE OF status OR DELETE ON public.project_phases
  FOR EACH ROW EXECUTE FUNCTION public.project_phases_progress();

-- ─── 4. Projekce do klientského prostoru ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS portal.phases (
  id uuid PRIMARY KEY,
  client_id uuid NOT NULL,
  project_id uuid NOT NULL,
  position integer NOT NULL,
  name text NOT NULL,
  description text,
  due_date date,
  status text NOT NULL,
  done_at timestamptz,
  FOREIGN KEY (client_id, project_id) REFERENCES portal.projects (client_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS portal_phases_project_idx ON portal.phases (client_id, project_id, position);

CREATE TABLE IF NOT EXISTS portal.phase_tasks (
  id uuid PRIMARY KEY,
  client_id uuid NOT NULL,
  project_id uuid NOT NULL,
  phase_id uuid NOT NULL,
  position integer NOT NULL,
  body text NOT NULL,
  done_at timestamptz,
  FOREIGN KEY (client_id, project_id) REFERENCES portal.projects (client_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS portal_phase_tasks_project_idx ON portal.phase_tasks (client_id, project_id);

-- Kdo kdy úkol označil nebo vrátil. Slouží limitu; portal_app ji nevidí.
CREATE TABLE IF NOT EXISTS portal.task_marks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL,
  member_id uuid NOT NULL,
  task_id uuid NOT NULL,
  done boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (client_id, member_id) REFERENCES portal.members (client_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS portal_task_marks_member_idx ON portal.task_marks (member_id, created_at DESC);

ALTER TABLE portal.phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal.phase_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal.task_marks ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['phases', 'phase_tasks', 'task_marks'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'portal' AND tablename = t AND policyname = 'client_isolation') THEN
      EXECUTE format(
        'CREATE POLICY client_isolation ON portal.%I USING (client_id = portal.current_client()) WITH CHECK (client_id = portal.current_client())',
        t
      );
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION portal.sync_phase() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, portal, public AS $$
DECLARE
  owner_client uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM portal.phases WHERE id = OLD.id;
    RETURN OLD;
  END IF;
  SELECT client_id INTO owner_client FROM portal.projects WHERE id = NEW.project_id;
  IF owner_client IS NOT NULL THEN
    INSERT INTO portal.phases (id, client_id, project_id, position, name, description, due_date, status, done_at)
    VALUES (NEW.id, owner_client, NEW.project_id, NEW.position, NEW.name, NEW.client_description, NEW.due_date, NEW.status, NEW.done_at)
    ON CONFLICT (id) DO UPDATE
      SET position = EXCLUDED.position, name = EXCLUDED.name, description = EXCLUDED.description,
          due_date = EXCLUDED.due_date, status = EXCLUDED.status, done_at = EXCLUDED.done_at;
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION portal.sync_phase_task() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, portal, public AS $$
DECLARE
  owner_client uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM portal.phase_tasks WHERE id = OLD.id;
    RETURN OLD;
  END IF;
  SELECT client_id INTO owner_client FROM portal.projects WHERE id = NEW.project_id;
  IF owner_client IS NOT NULL THEN
    INSERT INTO portal.phase_tasks (id, client_id, project_id, phase_id, position, body, done_at)
    VALUES (NEW.id, owner_client, NEW.project_id, NEW.phase_id, NEW.position, NEW.body, NEW.client_done_at)
    ON CONFLICT (id) DO UPDATE
      SET phase_id = EXCLUDED.phase_id, position = EXCLUDED.position, body = EXCLUDED.body, done_at = EXCLUDED.done_at;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS portal_sync_phase ON public.project_phases;
CREATE TRIGGER portal_sync_phase
  AFTER INSERT OR UPDATE OR DELETE ON public.project_phases
  FOR EACH ROW EXECUTE FUNCTION portal.sync_phase();

DROP TRIGGER IF EXISTS portal_sync_phase_task ON public.project_phase_tasks;
CREATE TRIGGER portal_sync_phase_task
  AFTER INSERT OR UPDATE OR DELETE ON public.project_phase_tasks
  FOR EACH ROW EXECUTE FUNCTION portal.sync_phase_task();

-- Propojení zakázky s klientem (095) nově kopíruje i etapy a úkoly.
CREATE OR REPLACE FUNCTION portal.link_project(p_client uuid, p_project uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, portal, public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM portal.projects WHERE id = p_project AND client_id <> p_client) THEN
    RAISE EXCEPTION 'Zakázka už patří jinému klientovi.' USING ERRCODE = '23505';
  END IF;

  INSERT INTO portal.projects (id, client_id, name, description, status, progress, deadline, project_url, updated_at)
  SELECT p.id, p_client, p.client_name, p.description, p.status, p.progress, p.deadline, p.project_url, p.updated_at
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
END
$$;

-- Klient označí svůj úkol jako hotový (nebo to vrátí). Vrací zakázku a jestli
-- se něco změnilo — upozornění Kryštofovi posílá aplikace, jen když `changed`.
CREATE OR REPLACE FUNCTION portal.submit_task_state(p_task uuid, p_member uuid, p_done boolean)
RETURNS TABLE (task_project uuid, changed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, portal, public AS $$
DECLARE
  cid uuid := portal.current_client();
  t portal.phase_tasks%ROWTYPE;
BEGIN
  IF p_task IS NULL OR p_done IS NULL THEN
    RAISE EXCEPTION 'invalid' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO t FROM portal.phase_tasks pt WHERE pt.id = p_task AND pt.client_id = cid;
  IF cid IS NULL OR NOT FOUND THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;
  PERFORM portal.assert_member_project(t.project_id, p_member);

  IF p_done = (t.done_at IS NOT NULL) THEN
    RETURN QUERY SELECT t.project_id, false;
    RETURN;
  END IF;
  IF (SELECT count(*) FROM portal.task_marks m WHERE m.member_id = p_member AND m.created_at > now() - interval '1 hour') >= 60 THEN
    RAISE EXCEPTION 'rate_limited' USING ERRCODE = 'P0429';
  END IF;

  UPDATE public.project_phase_tasks
  SET client_done_at = CASE WHEN p_done THEN now() END,
      client_done_by = CASE WHEN p_done THEN p_member END
  WHERE id = p_task;

  INSERT INTO portal.task_marks (client_id, member_id, task_id, done) VALUES (cid, p_member, p_task, p_done);
  RETURN QUERY SELECT t.project_id, true;
END
$$;

REVOKE ALL ON FUNCTION portal.link_project(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION portal.submit_task_state(uuid, uuid, boolean) FROM PUBLIC;
