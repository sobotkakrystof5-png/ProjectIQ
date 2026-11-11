-- Migrace 102: jeden byznys, tři zdroje poptávek (AD02, R-088)
--
-- VIZEON a ALTENO přestávají být dva byznysy. Zůstává jeden byznys a u každé
-- zakázky, termínu a leadu se jen eviduje, ODKUD poptávka přišla. Proto se
-- sloupec `business` přejmenovává na `lead_origin` — nezahazuje se: ruční
-- zakázka založená v sekci /alteno má `source = 'manual'` a informace „přišel
-- přes Alteno" není nikde jinde. Přejmenování navíc donutí TypeScript a grep
-- projít všechna čtecí místa, což je nejspolehlivější obrana proti mrtvému kódu.
--
-- POZOR — NASAZENÍ: přejmenování sloupce je JEDINÁ nekompatibilní změna této
-- migrace. Starý build adminu (produkce dnes běží na `d948400`) čte a zapisuje
-- `business`, takže 102 se smí aplikovat na produkci TEPRVE SPOLU s nasazením
-- větve `admin/modernizace`. Dřív by rozbila /dashboard i veřejná booking API.
--
-- Vše ostatní je aditivní (expand): `vizeon_confirmed`, `alteno_confirmed`
-- i funkce `is_vizeon_pending()` / `is_alteno_pending()` zůstávají, takže
-- revert kódu nic nerozbije. Jejich DROP je samostatná migrace až po týdnu
-- provozu.
--
-- Idempotentní: opakovaný běh nic nezmění ani nespadne.

-- 1. business → lead_origin (projects, calendar_events, agent_leads) -----------
-- Přejmenování se nedá napsat přes IF NOT EXISTS, proto guard na katalogu.
-- Pořadí uvnitř bloku nehraje roli, každá tabulka se řeší samostatně.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['projects', 'calendar_events', 'agent_leads'] LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'business'
    ) AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'lead_origin'
    ) THEN
      EXECUTE format('ALTER TABLE public.%I RENAME COLUMN business TO lead_origin', t);
    END IF;
  END LOOP;
END $$;

-- Indexy se při RENAME COLUMN nepřejmenují samy — jejich jméno by dál lhalo.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_projects_business' AND relkind = 'i')
     AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_projects_lead_origin') THEN
    ALTER INDEX idx_projects_business RENAME TO idx_projects_lead_origin;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_calendar_events_business' AND relkind = 'i')
     AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_calendar_events_lead_origin') THEN
    ALTER INDEX idx_calendar_events_business RENAME TO idx_calendar_events_lead_origin;
  END IF;
END $$;

-- 2. lead_confirmed: jeden příznak místo dvojice ------------------------------
-- Backfill BĚŽÍ DŘÍV než jakýkoli trigger nebo DEFAULT na časovou značku —
-- u historických řádků datum potvrzení neznáme, a `now()` by si ho vymyslel.
-- Proto `lead_confirmed_at` zůstává u historie NULL.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS lead_confirmed    boolean;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS lead_confirmed_at timestamptz;

UPDATE projects
SET lead_confirmed = coalesce(vizeon_confirmed, false) OR coalesce(alteno_confirmed, false)
WHERE lead_confirmed IS NULL;

-- Až po backfillu: NOT NULL + DEFAULT, aby na `lead_confirmed` mohl stát
-- generovaný sloupec (NULL by z `NOT lead_confirmed` udělal NULL, ne false).
ALTER TABLE projects ALTER COLUMN lead_confirmed SET DEFAULT false;
ALTER TABLE projects ALTER COLUMN lead_confirmed SET NOT NULL;

-- Trigger AŽ TEĎ, po backfillu: čas potvrzení si nese databáze, aby ho
-- aplikace nemohla zapomenout, a staré příznaky zůstávají pravdivé, dokud
-- v tabulce jsou (sloupce se zahodí samostatnou migrací až po provozu).
-- Kdyby trigger existoval dřív, orazítkoval by `now()` i historii, u které
-- datum potvrzení neznáme.
CREATE OR REPLACE FUNCTION projects_lead_confirmed_sync()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF NEW.lead_confirmed AND NEW.lead_confirmed_at IS NULL THEN
    NEW.lead_confirmed_at := now();
  ELSIF NOT NEW.lead_confirmed THEN
    NEW.lead_confirmed_at := NULL;
  END IF;
  NEW.vizeon_confirmed := NEW.lead_confirmed;
  NEW.alteno_confirmed := NEW.lead_confirmed;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_projects_lead_confirmed ON projects;
CREATE TRIGGER trg_projects_lead_confirmed
  BEFORE INSERT OR UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION projects_lead_confirmed_sync();

-- 3. lead_pending: jedna podmínka místo dvou funkcí ---------------------------
-- Dřív to byly funkce is_vizeon_pending() / is_alteno_pending(), protože
-- neonový `sql` tagged template neumí skládat fragmenty (viz 048). Generovaný
-- sloupec je lepší: každý dotaz píše jen `WHERE lead_pending` a jde indexovat.
--
-- DO GENEROVANÉHO SLOUPCE SE NIKDY NEZAPISUJE — žádný INSERT INTO projects
-- ho nesmí uvádět, jinak Postgres celý zápis odmítne.
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS lead_pending boolean
  GENERATED ALWAYS AS (source IS NOT NULL AND source <> 'manual' AND NOT lead_confirmed) STORED;

CREATE INDEX IF NOT EXISTS idx_projects_lead_pending
  ON projects (created_at DESC) WHERE lead_pending;

-- 4. Hodnoty sloupců hlídá CHECK — NOT VALID, pak validace jen když data sedí -
-- Historická hodnota, o které nevíme, nesmí migraci shodit. Validace proto
-- proběhne jen tehdy, když ji žádný řádek neporušuje; jinak se jen vypíše,
-- co to blokuje, a constraint zůstane NOT VALID (nová data už hlídá).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projects_lead_origin_check') THEN
    ALTER TABLE projects ADD CONSTRAINT projects_lead_origin_check
      CHECK (lead_origin IN ('vizeon', 'alteno', 'prvotka', 'jiny')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projects_source_check') THEN
    ALTER TABLE projects ADD CONSTRAINT projects_source_check
      CHECK (source IN ('manual', 'vizeon_web', 'alteno_web', 'prvotka_web')) NOT VALID;
  END IF;
  -- projects.status dodnes žádný CHECK neměl; hodnoty jsou z lib/types.ts.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projects_status_check') THEN
    ALTER TABLE projects ADD CONSTRAINT projects_status_check
      CHECK (status IN ('new', 'in_progress', 'review', 'done', 'paid')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'calendar_events_lead_origin_check') THEN
    ALTER TABLE calendar_events ADD CONSTRAINT calendar_events_lead_origin_check
      CHECK (lead_origin IN ('vizeon', 'alteno', 'prvotka', 'jiny')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agent_leads_lead_origin_check') THEN
    ALTER TABLE agent_leads ADD CONSTRAINT agent_leads_lead_origin_check
      CHECK (lead_origin IS NULL OR lead_origin IN ('vizeon', 'alteno', 'prvotka', 'jiny')) NOT VALID;
  END IF;
END $$;

DO $$
DECLARE
  bad_origin  int;
  bad_source  int;
  bad_status  int;
  bad_events  int;
  bad_agent   int;
BEGIN
  SELECT count(*) INTO bad_origin FROM projects WHERE lead_origin NOT IN ('vizeon','alteno','prvotka','jiny');
  SELECT count(*) INTO bad_source FROM projects WHERE source IS NOT NULL AND source NOT IN ('manual','vizeon_web','alteno_web','prvotka_web');
  SELECT count(*) INTO bad_status FROM projects WHERE status IS NOT NULL AND status NOT IN ('new','in_progress','review','done','paid');
  SELECT count(*) INTO bad_events FROM calendar_events WHERE lead_origin NOT IN ('vizeon','alteno','prvotka','jiny');
  SELECT count(*) INTO bad_agent  FROM agent_leads     WHERE lead_origin IS NOT NULL AND lead_origin NOT IN ('vizeon','alteno','prvotka','jiny');

  IF bad_origin = 0 THEN ALTER TABLE projects VALIDATE CONSTRAINT projects_lead_origin_check;
  ELSE RAISE NOTICE 'projects.lead_origin: % řádků s neznámou hodnotou, constraint zůstává NOT VALID', bad_origin; END IF;

  IF bad_source = 0 THEN ALTER TABLE projects VALIDATE CONSTRAINT projects_source_check;
  ELSE RAISE NOTICE 'projects.source: % řádků s neznámou hodnotou, constraint zůstává NOT VALID', bad_source; END IF;

  IF bad_status = 0 THEN ALTER TABLE projects VALIDATE CONSTRAINT projects_status_check;
  ELSE RAISE NOTICE 'projects.status: % řádků s neznámou hodnotou, constraint zůstává NOT VALID', bad_status; END IF;

  IF bad_events = 0 THEN ALTER TABLE calendar_events VALIDATE CONSTRAINT calendar_events_lead_origin_check;
  ELSE RAISE NOTICE 'calendar_events.lead_origin: % řádků s neznámou hodnotou, constraint zůstává NOT VALID', bad_events; END IF;

  IF bad_agent = 0 THEN ALTER TABLE agent_leads VALIDATE CONSTRAINT agent_leads_lead_origin_check;
  ELSE RAISE NOTICE 'agent_leads.lead_origin: % řádků s neznámou hodnotou, constraint zůstává NOT VALID', bad_agent; END IF;
END $$;

-- 5. Po aplikaci zkontrolovat ručně -------------------------------------------
--   SELECT source, lead_origin, count(*) FROM projects GROUP BY 1, 2 ORDER BY 1, 2;
--   SELECT id, client_name, source, created_at FROM projects WHERE lead_pending ORDER BY created_at;
-- Druhý dotaz je nový inbox. Objeví-li se v něm stará poptávka, kterou nikdo
-- nikdy nepotvrdil (dřív ji schovával jiný `source`), potvrď ji nebo smaž —
-- `lead_pending` je teď jediné pravidlo pro „čeká na potvrzení".
