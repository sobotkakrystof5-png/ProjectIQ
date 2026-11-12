-- Migrace 106: zakázka jako jediná pravda (AD11, R-090)
--
-- `completed_projects` je dnes **plná kopie** zakázky — vlastní `title`,
-- `client_name`, `amount` a `notes`, které si žijí svým životem: editace
-- dokončeného nezmění zakázku a naopak. `createCompletedProject` navíc umí
-- založit záznam bez zakázky a vložit k němu příjem nezávisle na tom, jestli
-- zakázka svůj příjem už má. Odtud riziko dvojího započtení.
--
-- Po téhle migraci je dokončenost **stav zakázky**: `closed_at` plus
-- `status IN ('done','paid')`. Tabulka se přejmenuje na
-- `completed_projects_archiv` a **nemaže se** — originál zůstává, dokud
-- daňové součty nesedí na korunu. Její `DROP` je samostatný krok až po AD18.
--
-- ŽÁDNÝ ŘÁDEK `finance_transactions` SE TU NEVKLÁDÁ ANI NEMAŽE. Migrace jen
-- **přepojuje odkazy** (`source_project_id`), takže součet příjmů za každý
-- rok je po ní z definice stejný jako před ní. Ověření:
--   node scripts/admin-income-check.mjs --ulozit pred.json   (před migrací)
--   node scripts/admin-income-check.mjs --porovnat pred.json (po migraci)
--
-- NEKOMPATIBILNÍ SE STARÝM BUILDEM, stejně jako 102: přejmenovaná tabulka
-- rozbije `/dashboard/dokoncene` a `/dashboard/hodnoceni` na produkci, která
-- běží na starém buildu. Pořadí je proto: nasadit větev `admin/modernizace`,
-- pak 102, pak 106.
--
-- Idempotentní: opakovaný běh nic nezdvojí — `migrated_project_id` v archivu
-- si pamatuje, která zakázka už z kterého řádku vznikla.

-- ─── 1. Zakázka umí nést, co dosud uměly jen Dokončené ───────────────────────
-- `closed_at` je okamžik uzavření; `status` zůstává stav práce. Uzavření jde
-- vzít zpět (`closed_at = NULL`), protože se už nikam nekopíruje.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS closed_at timestamptz;

-- Druh zakázky: `client` je práce pro klienta, `personal` vlastní aplikace
-- a automatizace bez klienta (dřív „Osobní projekty" v Dokončených).
-- Hodnoty jsou shodné s `lib/types.ts` → `ProjectType`.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_type text NOT NULL DEFAULT 'client';

-- Výkonnost: náročnost, odpracovaný čas a odhad z doby, kdy se zakázka brala.
-- Všechno nepovinné — u historických zakázek se nedopočítává (nebyl by to
-- odhad, ale vymyšlené číslo, B10).
ALTER TABLE projects ADD COLUMN IF NOT EXISTS difficulty       integer;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS time_invested    numeric;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS estimated_hours  numeric;
-- `company` nesly jen Dokončené; zakázka má dosud jen `client_name`.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS company          text;

-- Dotazník spokojenosti se posílá odkazem `/h/<token>`. Token se **přebírá
-- z archivu**, aby e-maily rozeslané dřív dál fungovaly.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS survey_token uuid DEFAULT gen_random_uuid();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projects_project_type_check') THEN
    ALTER TABLE projects ADD CONSTRAINT projects_project_type_check
      CHECK (project_type IN ('client', 'personal')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projects_difficulty_check') THEN
    ALTER TABLE projects ADD CONSTRAINT projects_difficulty_check
      CHECK (difficulty IS NULL OR (difficulty >= 1 AND difficulty <= 10)) NOT VALID;
  END IF;
END
$$;

-- ─── 2. Archiv ───────────────────────────────────────────────────────────────
-- Přejmenování, ne smazání. Cizí klíče (`project_surveys.completed_project_id`,
-- `finance_transactions.source_completed_project_id`) jdou s tabulkou samy.
DO $$
BEGIN
  IF to_regclass('public.completed_projects') IS NOT NULL
     AND to_regclass('public.completed_projects_archiv') IS NULL THEN
    ALTER TABLE completed_projects RENAME TO completed_projects_archiv;
    RAISE NOTICE 'completed_projects → completed_projects_archiv.';
  END IF;
END
$$;

-- ─── 3. Hodnocení visí na zakázce ────────────────────────────────────────────
-- `completed_project_id` zůstává (ukazuje do archivu) a přestává být povinné —
-- nový dotazník se váže jen na zakázku.
ALTER TABLE project_surveys ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id) ON DELETE CASCADE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'project_surveys'
      AND column_name = 'completed_project_id' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE project_surveys ALTER COLUMN completed_project_id DROP NOT NULL;
  END IF;
END
$$;

-- Jeden dotazník na zakázku. Částečný unique: archivní řádky bez `project_id`
-- se nepočítají a NULL se v Postgresu neduplikuje.
CREATE UNIQUE INDEX IF NOT EXISTS project_surveys_project_uq
  ON project_surveys (project_id) WHERE project_id IS NOT NULL;

-- ─── 4. Stopa po převodu ─────────────────────────────────────────────────────
-- Která zakázka z kterého archivního řádku vznikla. Drží idempotenci
-- a zároveň je to doklad pro kontrolu součtů.
ALTER TABLE completed_projects_archiv ADD COLUMN IF NOT EXISTS migrated_project_id uuid REFERENCES projects(id) ON DELETE SET NULL;

-- ─── 5. Dokončené SE zakázkou → doplnit do zakázky ───────────────────────────
-- Zakázka dostane datum uzavření, druh, čísla výkonnosti a token dotazníku.
-- `price`, `paid` ani peníze se **nepřepisují** — `completed_projects_archiv.amount`
-- byla druhá verze pravdy o ceně a přepsat jí zakázku by změnilo čísla.
-- Rozdíl mezi nimi se jen vypíše jako NOTICE.
DO $$
DECLARE
  r record;
  rozdilu int := 0;
  dvojich int := 0;
BEGIN
  FOR r IN
    SELECT DISTINCT ON (c.source_project_id)
           c.id, c.source_project_id, c.completed_at, c.project_type, c.difficulty,
           c.time_invested, c.estimated_hours, c.company, c.survey_token, c.amount,
           p.price AS project_price
    FROM completed_projects_archiv c
    JOIN projects p ON p.id = c.source_project_id
    WHERE c.source_project_id IS NOT NULL
    ORDER BY c.source_project_id, c.completed_at ASC, c.id ASC
  LOOP
    UPDATE projects SET
      closed_at       = COALESCE(closed_at, r.completed_at::timestamptz),
      project_type    = CASE WHEN project_type = 'client' THEN COALESCE(r.project_type, 'client') ELSE project_type END,
      difficulty      = COALESCE(difficulty, r.difficulty),
      time_invested   = COALESCE(time_invested, r.time_invested),
      estimated_hours = COALESCE(estimated_hours, r.estimated_hours),
      company         = COALESCE(company, r.company),
      -- Token z archivu vyhrává: odkaz z dřív odeslaného e-mailu musí platit.
      survey_token    = COALESCE(r.survey_token, survey_token),
      -- Dokončená zakázka nesmí zůstat „nová" nebo „v řešení".
      status          = CASE WHEN status IN ('done', 'paid') THEN status ELSE 'done' END
    WHERE id = r.source_project_id;

    IF r.amount IS NOT NULL AND r.project_price IS NOT NULL
       AND r.amount <> 0 AND r.amount <> r.project_price THEN
      rozdilu := rozdilu + 1;
      RAISE NOTICE 'Zakázka % má v archivu jinou částku (% vs. % na zakázce) — cena zakázky zůstává.',
        r.source_project_id, r.amount, r.project_price;
    END IF;
  END LOOP;

  -- Dvojí započtení z minulosti se tu **neopravuje** — daň už je z těch čísel
  -- přiznaná. Jen se vypíše, čeho se to týká.
  SELECT count(*) INTO dvojich
  FROM completed_projects_archiv c
  WHERE c.source_project_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM finance_transactions t
                WHERE t.source_completed_project_id = c.id AND t.type = 'income')
    AND EXISTS (SELECT 1 FROM finance_transactions t
                WHERE t.source_project_id = c.source_project_id AND t.type = 'income');
  IF dvojich > 0 THEN
    RAISE NOTICE 'POZOR: % zakázek má příjem z Dokončených i ze zakázky (možné dvojí započtení v minulosti). Migrace čísla nemění.', dvojich;
  END IF;

  RAISE NOTICE 'Dokončené se zakázkou: převedeno, % s odlišnou částkou.', rozdilu;
END
$$;

-- Hodnocení k Dokončeným, které zakázku mají.
UPDATE project_surveys s
SET project_id = c.source_project_id
FROM completed_projects_archiv c
WHERE s.completed_project_id = c.id
  AND c.source_project_id IS NOT NULL
  AND s.project_id IS NULL
  -- Dvojí dotazník na jednu zakázku by shodil částečný unique; vyhrává první.
  AND NOT EXISTS (SELECT 1 FROM project_surveys x WHERE x.project_id = c.source_project_id);

-- Příjmy, které vznikly přes Dokončené, ale zakázku mají.
UPDATE finance_transactions t
SET source_project_id = c.source_project_id
FROM completed_projects_archiv c
WHERE t.source_completed_project_id = c.id
  AND c.source_project_id IS NOT NULL
  AND t.source_project_id IS NULL;

-- ─── 6. Dokončené BEZ zakázky → založit zakázku ──────────────────────────────
-- Ručně doplněná historie (a osobní projekty) by jinak z aplikace zmizela
-- i s příjmem a hodnocením. Zakázka vzniká rovnou uzavřená a zaplacená,
-- s cenou z archivu — tady je archiv jediným zdrojem, takže se nic nepřepisuje.
--
-- `source` zůstává na výchozím 'manual', aby generovaný `lead_pending` vyšel
-- false a řádek nespadl do Poptávek. Do `lead_pending` se nikdy nezapisuje.
DO $$
DECLARE
  r record;
  nove_id uuid;
  zalozeno int := 0;
BEGIN
  FOR r IN
    SELECT * FROM completed_projects_archiv
    WHERE source_project_id IS NULL AND migrated_project_id IS NULL
    ORDER BY completed_at ASC, created_at ASC, id ASC
  LOOP
    INSERT INTO projects (
      client_name, company, description, status, progress, price, paid,
      deposit_amount, deposit_paid, notes, client_email, closed_at,
      project_type, difficulty, time_invested, estimated_hours,
      survey_token, contact_id, created_at, updated_at
    ) VALUES (
      -- `client_name` je NOT NULL; osobní projekt klienta nemá, zastoupí ho název.
      COALESCE(NULLIF(btrim(COALESCE(r.client_name, '')), ''), NULLIF(btrim(COALESCE(r.company, '')), ''), r.title),
      r.company,
      r.title,
      'paid',
      100,
      r.amount,
      true,
      r.deposit_amount,
      COALESCE(r.deposit_amount, 0) > 0,
      r.notes,
      r.client_email,
      r.completed_at::timestamptz,
      COALESCE(r.project_type, 'client'),
      r.difficulty,
      r.time_invested,
      r.estimated_hours,
      r.survey_token,
      r.contact_id,
      COALESCE(r.created_at, r.completed_at::timestamptz),
      now()
    )
    RETURNING id INTO nove_id;

    UPDATE completed_projects_archiv SET migrated_project_id = nove_id WHERE id = r.id;

    -- Příjem se **nevytváří**, jen se přepojí ten, který už existuje.
    UPDATE finance_transactions
    SET source_project_id = nove_id
    WHERE source_completed_project_id = r.id AND source_project_id IS NULL;

    UPDATE project_surveys
    SET project_id = nove_id
    WHERE completed_project_id = r.id AND project_id IS NULL;

    zalozeno := zalozeno + 1;
  END LOOP;
  RAISE NOTICE 'Dokončené bez zakázky: založeno % zakázek.', zalozeno;
END
$$;

-- ─── 7. Token dotazníku je od teď klíč zakázky ───────────────────────────────
-- Zakázky, které v archivu nebyly, token zatím nemají (sloupec přibyl
-- s DEFAULT, ale existující řádky dostaly NULL).
UPDATE projects SET survey_token = gen_random_uuid() WHERE survey_token IS NULL;

-- Kdyby dva archivní řádky nesly tentýž token (nikdy by neměly — DEFAULT je
-- gen_random_uuid), unique index by migraci shodil. Proto se duplicity nejdřív
-- přerazítkují: vyhrává nejstarší zakázka.
UPDATE projects p SET survey_token = gen_random_uuid()
WHERE EXISTS (
  SELECT 1 FROM projects q
  WHERE q.survey_token = p.survey_token
    AND (q.created_at, q.id) < (p.created_at, p.id)
);

CREATE UNIQUE INDEX IF NOT EXISTS projects_survey_token_uq ON projects (survey_token);

-- ─── 8. Indexy ───────────────────────────────────────────────────────────────
-- Výpis dokončených zakázek a přehled výkonnosti.
CREATE INDEX IF NOT EXISTS idx_projects_closed_at ON projects (closed_at DESC) WHERE closed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_projects_project_type ON projects (project_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_surveys_project ON project_surveys (project_id);
