-- Migrace 136: navrhovač nabídek, krok N1 — rozbor firmy (R-147, docs/admin/NABIDKY-PLAN.md)
--
-- Kryštof u kontaktu klikne „Připravit rozbor". Agenti u Anthropicu (Managed
-- Agents) projdou web firmy a veřejné zdroje a výsledek vrátí strukturovaně.
-- Tady leží jen to, co admin z běhu převzal: zadání (veřejné údaje o firmě),
-- výsledek se zdroji, cena a doba běhu. Historii běhu u Anthropicu admin po
-- převzetí maže (DECISIONS #055).
--
-- Rozbor je o firmě, u OSVČ ale i o člověku (jméno, IČO), proto:
--   • smazání kontaktu nebo firmy od asistenta smaže i rozbor (cizí klíč),
--   • rozbor bez zakázky se smaže 12 měsíců od poslední změny (D-N5),
--     úklid dělá `purge_offer_research()` v denním cronu client-retention.
--
-- Idempotentní: druhý běh nic nezmění. Aditivní, starý build ji nečte.

CREATE TABLE IF NOT EXISTS offer_research (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id        uuid        REFERENCES contacts(id) ON DELETE CASCADE,
  outreach_lead_id  uuid        REFERENCES outreach_leads(id) ON DELETE CASCADE,
  -- Zakázka, která z rozboru vznikla (N3). Dokud je, úklid po 12 měsících rozbor nechá.
  project_id        uuid        REFERENCES projects(id) ON DELETE SET NULL,
  status            text        NOT NULL DEFAULT 'running'
                                CHECK (status IN ('running', 'done', 'failed')),
  -- Běh u Anthropicu. Po převzetí výsledku se session maže a id zůstává jen pro dohledání.
  session_id        text        CHECK (session_id IS NULL OR session_id ~ '^[A-Za-z0-9_-]{1,200}$'),
  -- Co agenti dostali: jen veřejné údaje o firmě (jméno, web, IČO, město, obor).
  brief             jsonb       NOT NULL,
  -- Výsledek po kontrole serverem (lib/admin/offers/result.ts). NULL, dokud běh nedoběhl.
  result            jsonb,
  -- Krátký kód chyby pro obrazovku (`timeout`, `budget`, `invalid_result`…), nikdy text od modelu.
  error             text        CHECK (error IS NULL OR error ~ '^[a-z_]{1,40}$'),
  cost_cents        integer     CHECK (cost_cents IS NULL OR cost_cents >= 0),
  active_seconds    integer     CHECK (active_seconds IS NULL OR active_seconds >= 0),
  agent_version     integer,
  created_at        timestamptz NOT NULL DEFAULT now(),
  finished_at       timestamptz,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (contact_id IS NOT NULL OR outreach_lead_id IS NOT NULL)
);

COMMENT ON TABLE offer_research IS
  'Rozbor firmy pro navrhovač nabídek (R-147). Veřejné údaje se zdroji, bez zakázky 12 měsíců.';

CREATE INDEX IF NOT EXISTS offer_research_contact_idx
  ON offer_research (contact_id, created_at DESC) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS offer_research_lead_idx
  ON offer_research (outreach_lead_id, created_at DESC) WHERE outreach_lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS offer_research_running_idx
  ON offer_research (created_at) WHERE status = 'running';

-- Jeden běžící rozbor na kontakt: dvojklik ani dvě záložky nespustí dva placené běhy.
CREATE UNIQUE INDEX IF NOT EXISTS offer_research_one_running_per_contact
  ON offer_research (contact_id) WHERE status = 'running' AND contact_id IS NOT NULL;

-- Agenti u Anthropicu: id prostředí, agentů, jejich verze a otisk nastavení z kódu.
-- Zakládá je Kryštof tlačítkem; když se nastavení v kódu změní, tlačítko je aktualizuje.
ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS offer_agents jsonb;

CREATE OR REPLACE FUNCTION purge_offer_research() RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  removed integer;
BEGIN
  DELETE FROM offer_research
   WHERE project_id IS NULL
     AND status <> 'running'
     AND updated_at < now() - interval '12 months';
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END;
$$;

COMMENT ON FUNCTION purge_offer_research() IS
  'Smaže rozbory bez zakázky 12 měsíců od poslední změny (R-147, D-N5).';
