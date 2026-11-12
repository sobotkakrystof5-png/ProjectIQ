-- Migrace 104: jedna entita kontaktu (AD09)
--
-- Dnes žije kontakt jako text v osmi místech (`client_leads`, `projects`,
-- `consultation_slots`, `completed_projects`, `agent_leads`, `portal.members`,
-- `portal.invites`, `ws.customers`) — bez unique, bez indexu, bez normalizace.
-- Jeden člověk je tak osm řádků a nejde zjistit, že je to on.
--
-- Tahle migrace zakládá `contacts` a do pěti tabulek ve `public` přidává
-- `contact_id`. Schémata `portal` a `ws` zůstávají oddělená (R-073): `ws.customers`
-- jsou zákazníci cizích firem, `portal.members` jsou přihlašovací identity
-- klientů. Spojka na klientský prostor je jediný sloupec `portal_client_id`.
--
-- Aditivní a idempotentní: nic se nepřejmenovává ani nemaže, žádný existující
-- dotaz adminu se nemění. **Starý build adminu tahle migrace nerozbije** (na
-- rozdíl od 102), takže se smí aplikovat i před nasazením větve.
--
-- Backfill (kdo s kým je jeden člověk) v migraci **není** — je to masový zápis
-- s rozhodováním o sporných případech. Dělá ho `scripts/admin-contacts-backfill.mjs`
-- s výchozím dry-run.

-- ─── 1. Kontakt ──────────────────────────────────────────────────────────────
-- `display_name` je jméno k zobrazení (NOT NULL — kontakt bez jména se nedá
-- v seznamu najít); textové sloupce v zakázkách a na fakturách zůstávají jako
-- snímek dokladu. Pravidlo: `contact_id` = kdo to je, text = co bylo tehdy
-- napsáno.
--
-- `phone` má stejný CHECK jako `ws.customers` (migrace 067): E.164, tedy
-- `+420777123456`. Normalizaci dělá `lib/contacts/normalize.ts`.
CREATE TABLE IF NOT EXISTS contacts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name  text NOT NULL,
  company       text,
  email         text,
  phone         text CHECK (phone ~ '^\+[1-9][0-9]{6,14}$'),
  ico           text,
  dic           text,
  note          text,
  -- Odkud kontakt vznikl: `backfill` (migrace dat), `lead` (Hovory),
  -- `project` (zakázka), `web` (poptávka z webu), `manual` (ruční zápis).
  source        text NOT NULL DEFAULT 'manual',
  last_seen_at  timestamptz,
  merged_into   uuid REFERENCES contacts(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz,
  CONSTRAINT contacts_merged_not_self CHECK (merged_into IS NULL OR merged_into <> id)
);

-- Unique **částečné**: jen nad nesloučenými kontakty. Sloučený kontakt svůj
-- telefon a e-mail „uvolní", takže se po sloučení dá tentýž člověk zapsat
-- znovu, aniž by to něco zablokovalo. Formuláře adminu zapisují do
-- `client_leads` a `projects`, kde unique není vůbec — duplicitní kontakt
-- proto nikdy nezablokuje uložení, kolize se řeší v UI.
CREATE UNIQUE INDEX IF NOT EXISTS contacts_email_uq
  ON contacts (lower(email)) WHERE merged_into IS NULL AND email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS contacts_phone_uq
  ON contacts (phone) WHERE merged_into IS NULL AND phone IS NOT NULL;

-- Seznam kontaktů řadí podle jména a ukazuje jen nesloučené.
CREATE INDEX IF NOT EXISTS contacts_name_idx
  ON contacts (lower(btrim(display_name))) WHERE merged_into IS NULL;
CREATE INDEX IF NOT EXISTS contacts_merged_idx
  ON contacts (merged_into) WHERE merged_into IS NOT NULL;
CREATE INDEX IF NOT EXISTS contacts_seen_idx ON contacts (last_seen_at DESC);

-- ─── 2. contact_id v pěti tabulkách ──────────────────────────────────────────
-- `ON DELETE SET NULL`: smazaný kontakt nikdy nesmí vzít s sebou zakázku,
-- hovor ani dokončenou práci. Text v řádku zůstane, jen se přestane vědět,
-- kdo to byl.
ALTER TABLE client_leads        ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL;
ALTER TABLE projects            ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL;
ALTER TABLE consultation_slots  ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL;
ALTER TABLE completed_projects  ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL;
ALTER TABLE agent_leads         ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS client_leads_contact_idx       ON client_leads (contact_id)       WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS projects_contact_idx           ON projects (contact_id)           WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS consultation_slots_contact_idx ON consultation_slots (contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS completed_projects_contact_idx ON completed_projects (contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS agent_leads_contact_idx        ON agent_leads (contact_id)        WHERE contact_id IS NOT NULL;

-- ─── 3. Spojka na klientský prostor ──────────────────────────────────────────
-- `portal.clients` je přihlašovací nájemce, `contacts` je protistrana; většina
-- kontaktů prostor nikdy nedostane. Slučovat je nelze, aniž by se přepsal
-- grant model role `portal_app`, která nemá v `public` žádná práva (R-073),
-- a cizí klíče migrací 095/096/098, které už běží na produkci.
--
-- Na databázi bez schématu `portal` (čistý vývoj, PGlite v testech) se sloupec
-- jen nepřidá a migrace jede dál.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'portal' AND table_name = 'clients') THEN
    ALTER TABLE contacts ADD COLUMN IF NOT EXISTS portal_client_id uuid;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contacts_portal_client_fk') THEN
      ALTER TABLE contacts ADD CONSTRAINT contacts_portal_client_fk
        FOREIGN KEY (portal_client_id) REFERENCES portal.clients(id) ON DELETE SET NULL;
    END IF;
    CREATE UNIQUE INDEX IF NOT EXISTS contacts_portal_client_uq
      ON contacts (portal_client_id) WHERE portal_client_id IS NOT NULL;
  ELSE
    RAISE NOTICE 'schéma portal tu není, contacts.portal_client_id se nepřidává';
  END IF;
END $$;

-- ─── 4. Sloučení: kořen řetězu ───────────────────────────────────────────────
-- Sloučení **nic nemaže ani nepřepisuje**: nastaví se `merged_into` a čtení
-- přes `COALESCE(merged_into, id)` vede na cílový kontakt. „Zpět" je tedy
-- smazání jedné hodnoty a sloučení nepotřebuje zálohu.
--
-- Řetěz se drží plochý (A → B, nikdy A → B → C): kdo slučuje do už sloučeného
-- kontaktu, dostane jeho kořen. Čtení tak nikdy nemusí hledat víc než jeden
-- skok a „Zpět" vrací vždy do stavu „samostatný kontakt".
-- Funkce mají připnutý `search_path` a plně kvalifikované tabulky (vzor
-- migrace 080): bez toho by o tom, co znamená `contacts`, rozhodoval
-- search_path toho, kdo zápis provedl.
CREATE OR REPLACE FUNCTION contacts_root(p_id uuid) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  current_id uuid := p_id;
  next_id uuid;
  hops int := 0;
BEGIN
  IF p_id IS NULL THEN RETURN NULL; END IF;
  LOOP
    SELECT merged_into INTO next_id FROM public.contacts WHERE id = current_id;
    IF next_id IS NULL THEN RETURN current_id; END IF;
    current_id := next_id;
    hops := hops + 1;
    -- Cyklus by tu být nemohl (trigger ho nepustí), ale nekonečná smyčka
    -- v databázi je horší než vrácený mezivýsledek.
    IF hops > 10 THEN RETURN current_id; END IF;
  END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION contacts_before_write() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF NEW.merged_into IS NOT NULL THEN
    NEW.merged_into := public.contacts_root(NEW.merged_into);
    IF NEW.merged_into = NEW.id THEN NEW.merged_into := NULL; END IF;
  END IF;
  IF TG_OP = 'UPDATE' THEN NEW.updated_at := now(); END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_contacts_before_write ON contacts;
CREATE TRIGGER trg_contacts_before_write
  BEFORE INSERT OR UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION contacts_before_write();

-- ─── 5. Snímek v zakázce ─────────────────────────────────────────────────────
-- `portal.sync_project` (migrace 095) bere `NEW.client_name` jako název
-- zakázky v klientském prostoru. Denormalizace se proto nesmí jen „nechat
-- ležet" — musí se dál plnit, jinak klient uvidí zakázku bez názvu.
--
-- Při napojení kontaktu se doplní jen to, co v zakázce chybí: existující text
-- nikdy nepřepisujeme, protože je to snímek dokladu (a sloučení kontaktů tím
-- pádem názvy zakázek nemění).
CREATE OR REPLACE FUNCTION projects_contact_snapshot() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  c record;
BEGIN
  IF NEW.contact_id IS NULL THEN RETURN NEW; END IF;
  SELECT display_name, email, phone INTO c FROM public.contacts WHERE id = NEW.contact_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  NEW.client_name  := COALESCE(NULLIF(btrim(NEW.client_name), ''), c.display_name);
  NEW.client_email := COALESCE(NULLIF(btrim(NEW.client_email), ''), c.email);
  NEW.client_phone := COALESCE(NULLIF(btrim(NEW.client_phone), ''), c.phone);
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_projects_contact_snapshot ON projects;
CREATE TRIGGER trg_projects_contact_snapshot
  BEFORE INSERT OR UPDATE OF contact_id ON projects
  FOR EACH ROW EXECUTE FUNCTION projects_contact_snapshot();

-- Přejmenování kontaktu propadne do jeho zakázek — ale jen tam, kde zakázka
-- nesla **přesně** starý text (jinak si zakázka svůj zápis drží) a jen při
-- skutečné změně (`IS DISTINCT FROM`). Bez té podmínky by se `updated_at`
-- hýbal při každém uložení kontaktu a klientovi by v portálu lhalo
-- „Naposledy upraveno". `updated_at` zakázky se tu záměrně nemění: jméno
-- klienta není pohyb na zakázce.
CREATE OR REPLACE FUNCTION contacts_snapshot_propagate() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF NEW.display_name IS DISTINCT FROM OLD.display_name THEN
    UPDATE public.projects SET client_name = NEW.display_name
    WHERE contact_id = NEW.id AND client_name = OLD.display_name AND client_name IS DISTINCT FROM NEW.display_name;
  END IF;
  IF NEW.email IS DISTINCT FROM OLD.email AND NEW.email IS NOT NULL THEN
    UPDATE public.projects SET client_email = NEW.email
    WHERE contact_id = NEW.id AND client_email IS NOT DISTINCT FROM OLD.email AND client_email IS DISTINCT FROM NEW.email;
  END IF;
  IF NEW.phone IS DISTINCT FROM OLD.phone AND NEW.phone IS NOT NULL THEN
    UPDATE public.projects SET client_phone = NEW.phone
    WHERE contact_id = NEW.id AND client_phone IS NOT DISTINCT FROM OLD.phone AND client_phone IS DISTINCT FROM NEW.phone;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_contacts_snapshot_propagate ON contacts;
CREATE TRIGGER trg_contacts_snapshot_propagate
  AFTER UPDATE OF display_name, email, phone ON contacts
  FOR EACH ROW EXECUTE FUNCTION contacts_snapshot_propagate();

-- ─── 6. Hledání podle části jména ────────────────────────────────────────────
-- Stejný guard jako v migraci 103: databáze bez `pg_trgm` (PGlite v testech)
-- migraci nezastaví, hledání pak jen čte celou tabulku.
DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_trgm není k dispozici (%), trigramový index na jméno se nezakládá', SQLERRM;
    RETURN;
  END;
  CREATE INDEX IF NOT EXISTS contacts_name_trgm_idx ON contacts USING gin (display_name gin_trgm_ops);
  CREATE INDEX IF NOT EXISTS contacts_company_trgm_idx ON contacts USING gin (company gin_trgm_ops);
END $$;

ANALYZE contacts;
