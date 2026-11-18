-- Migrace 119: AI asistent jako CRM — detail klienta z Growth OS (R-120)
--
-- Growth OS (vizeon-autopilot) dosud posílal jen snímek firmy s **posledním**
-- hovorem a hovory s přepisem až v reportu po kole. Detail klienta (ukázka,
-- všechny hovory, e-maily, časová osa) se z toho složit nedal. Kontrakt v2
-- (`types/outreach.ts`) posílá ke snímku i všechny hovory, e-maily a historii
-- stavů, a to hned po každé události, ne až hodinovou synchronizací.
--
-- Co přibývá:
--  - outreach_leads: segment, dávka importu, kdy robot zavolá znovu, schůzka
--    domluvená robotem, náhled a čtení ukázky, historie stavů, rešerše pro
--    studený e-mail, verze kontraktu. `admin_changed_at` nastavuje trigger,
--    kdykoli se změní „vyřízeno" — z toho čte zpětný kanál pro Growth OS
--    (`GET /api/public/outreach/handled`), ať robot nevolá, koho Kryštof
--    převzal nebo odložil.
--  - outreach_calls: id hovoru v ElevenLabs (jen pro dohledání, nahrávky se
--    nepřehrávají — stačí přepis), cena hovoru, stav od operátora (Odorik),
--    sesbíraná data a všechna hodnoticí kritéria.
--  - outreach_emails: každý e-mail, který robot firmě poslal — předmět, text
--    a co se s ním stalo (doručení, otevření, klik, odpověď).
--
-- Osobní údaje: `outreach_emails.body_text` je náš text, ale nese jméno
-- oslovené osoby. Úklid po 12 měsících (`purge_outreach_emails`), stejně
-- jako řádky hovorů. `collected` (data z hovoru) zmizí s řádkem hovoru.
--
-- Aditivní a idempotentní, smí jít na produkci před nasazením.
-- Bez ní kontrakt v1 funguje dál, v2 se uloží bez hovorů a e-mailů.

ALTER TABLE outreach_leads
  ADD COLUMN IF NOT EXISTS segment              text,
  ADD COLUMN IF NOT EXISTS source_batch         text,
  ADD COLUMN IF NOT EXISTS next_call_after      timestamptz,
  ADD COLUMN IF NOT EXISTS meeting_at           timestamptz,
  ADD COLUMN IF NOT EXISTS demo_slug            text,
  ADD COLUMN IF NOT EXISTS demo_preview_url     text,
  ADD COLUMN IF NOT EXISTS demo_last_viewed_at  timestamptz,
  ADD COLUMN IF NOT EXISTS demo_max_view_s      integer,
  ADD COLUMN IF NOT EXISTS status_history       jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS research             jsonb,
  ADD COLUMN IF NOT EXISTS snapshot_version     integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS admin_changed_at     timestamptz;

DO $$
BEGIN
  -- Náhled ukázky se stahuje přes náš server (jen z navrhy.vizeon.cz), i tak jen https.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'outreach_leads_preview_https_check') THEN
    ALTER TABLE outreach_leads ADD CONSTRAINT outreach_leads_preview_https_check
      CHECK (demo_preview_url IS NULL OR demo_preview_url LIKE 'https://%');
  END IF;
END
$$;

-- Zpětný kanál čte změny „vyřízeno" od posledního dotazu.
CREATE INDEX IF NOT EXISTS outreach_leads_admin_changed_idx
  ON outreach_leads (admin_changed_at)
  WHERE admin_changed_at IS NOT NULL;

-- Kdokoli změní „vyřízeno" (fronta, schůzka, ruční SQL), Growth OS se to dozví.
CREATE OR REPLACE FUNCTION outreach_leads_admin_changed()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.handled_at IS NOT NULL THEN
      NEW.admin_changed_at := now();
    END IF;
  ELSIF NEW.handled_at IS DISTINCT FROM OLD.handled_at
     OR NEW.handled_reason IS DISTINCT FROM OLD.handled_reason THEN
    NEW.admin_changed_at := now();
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_outreach_leads_admin_changed ON outreach_leads;
CREATE TRIGGER trg_outreach_leads_admin_changed
  BEFORE INSERT OR UPDATE ON outreach_leads
  FOR EACH ROW EXECUTE FUNCTION outreach_leads_admin_changed();

ALTER TABLE outreach_calls
  ADD COLUMN IF NOT EXISTS conversation_id   text,
  ADD COLUMN IF NOT EXISTS cost_czk          numeric(10, 2),
  ADD COLUMN IF NOT EXISTS cost_source       text,
  ADD COLUMN IF NOT EXISTS telephony_status  text,
  ADD COLUMN IF NOT EXISTS collected         jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS criteria          jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'outreach_calls_cost_source_check') THEN
    ALTER TABLE outreach_calls ADD CONSTRAINT outreach_calls_cost_source_check
      CHECK (cost_source IS NULL OR cost_source IN ('odhad', 'odorik'));
  END IF;
  -- Id hovoru v ElevenLabs: jen bezpečné znaky (kdyby se z něj někdy skládala adresa).
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'outreach_calls_conversation_id_check') THEN
    ALTER TABLE outreach_calls ADD CONSTRAINT outreach_calls_conversation_id_check
      CHECK (conversation_id IS NULL OR conversation_id ~ '^[A-Za-z0-9_-]{1,100}$');
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS outreach_calls_called_at_idx
  ON outreach_calls (called_at DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS outreach_emails (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- `vizeon-email:<id v D1>`, nikdy se nemění.
  external_id        text NOT NULL,
  -- Stejný klíč jako outreach_leads.external_id (vazba při čtení).
  lead_external_id   text NOT NULL,
  -- cold, demo, reminder, followup — neznámý druh se uloží, jak přišel.
  kind               text NOT NULL,
  status             text,
  subject            text,
  -- Náš text e-mailu. Jen text, nikdy HTML.
  body_text          text,
  scheduled_for      timestamptz,
  sent_at            timestamptz,
  delivered_at       timestamptz,
  opened_at          timestamptz,
  clicked_at         timestamptz,
  replied_at         timestamptz,
  bounced_at         timestamptz,
  open_count         integer NOT NULL DEFAULT 0,
  click_count        integer NOT NULL DEFAULT 0,
  received_at        timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS outreach_emails_external_id_key
  ON outreach_emails (external_id);
CREATE INDEX IF NOT EXISTS outreach_emails_lead_idx
  ON outreach_emails (lead_external_id);

-- Úklid e-mailů po 12 měsících od odeslání (u neodeslaných od příjmu).
-- Zvlášť od purge_outreach_retention z migrace 116, ať se nemění její tvar.
CREATE OR REPLACE FUNCTION purge_outreach_emails()
RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  n integer;
BEGIN
  DELETE FROM outreach_emails
   WHERE coalesce(sent_at, received_at) < now() - interval '365 days';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END
$$;
