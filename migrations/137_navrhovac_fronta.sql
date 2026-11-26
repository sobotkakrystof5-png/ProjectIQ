-- Migrace 137: navrhovač nabídek — rozbor běží v Claude Code na předplatném (R-149)
--
-- Rozbor už nespouští server přes placené Managed Agents (R-147, migrace 136).
-- Tlačítko u kontaktu založí řádek ve frontě (`queued`) a spustí cloudovou
-- úlohu Claude Code. Úloha si řádek vyzvedne (`running`), pustí subagenty
-- a výsledek pošle zpátky do adminu (`done`), nebo ohlásí neúspěch (`failed`).
--
-- Sloupec `session_id` nese id běhu v Claude Code a nový `session_url` odkaz,
-- kde Kryštof běh sleduje. `admin_settings.offer_agents` se už nepoužívá
-- (Managed Agents nikdy nevznikli), zůstává prázdný.
--
-- Idempotentní: druhý běh nic nezmění. Na produkci je tabulka prázdná.
-- V textech níž nesmí být středník: běhoun migrací dělí soubor podle něj.

ALTER TABLE offer_research DROP CONSTRAINT IF EXISTS offer_research_status_check;
ALTER TABLE offer_research ADD CONSTRAINT offer_research_status_check
  CHECK (status IN ('queued', 'running', 'done', 'failed'));
ALTER TABLE offer_research ALTER COLUMN status SET DEFAULT 'queued';

-- Kdy si úloha rozbor vyzvedla. Podle toho se pozná zaseknutý běh.
ALTER TABLE offer_research ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

-- Odkaz na běh v Claude Code (z odpovědi na spuštění), jen claude.ai.
-- Délka zvlášť: Postgres v regulárním výrazu nedovolí opakování přes 255.
ALTER TABLE offer_research ADD COLUMN IF NOT EXISTS session_url text
  CHECK (session_url IS NULL OR (length(session_url) <= 320 AND session_url ~ '^https://claude\.ai/[A-Za-z0-9/_?=&.%-]+$'));

-- Jeden otevřený rozbor na kontakt: ve frontě i běžící.
DROP INDEX IF EXISTS offer_research_one_running_per_contact;
CREATE UNIQUE INDEX IF NOT EXISTS offer_research_one_open_per_contact
  ON offer_research (contact_id) WHERE status IN ('queued', 'running') AND contact_id IS NOT NULL;

DROP INDEX IF EXISTS offer_research_running_idx;
CREATE INDEX IF NOT EXISTS offer_research_open_idx
  ON offer_research (created_at) WHERE status IN ('queued', 'running');

CREATE OR REPLACE FUNCTION purge_offer_research() RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  removed integer;
BEGIN
  DELETE FROM offer_research
   WHERE project_id IS NULL
     AND status NOT IN ('queued', 'running')
     AND updated_at < now() - interval '12 months';
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END;
$$;

COMMENT ON COLUMN admin_settings.offer_agents IS
  'Nepoužívá se od R-149 (rozbor běží v Claude Code, ne v Managed Agents).';
