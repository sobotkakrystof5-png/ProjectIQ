-- Migration 050: ALTENO — druhý byznys vedle VIZEONu
--
-- Sekce ALTENO (/alteno) je klon jádra VIZEON dashboardu — Zakázky + inbox
-- webových poptávek — nad stejnými tabulkami. Aby se data obou byznysů
-- nemíchala, dostává každý řádek `business` ('vizeon' | 'alteno'). Všechna
-- existující data patří VIZEONu, proto DEFAULT 'vizeon' (i pro backfill).
--
-- Nepotvrzená poptávka z webu se u ALTENA pozná stejně jako u VIZEONu —
-- vlastní `source` ('alteno_web') + vlastní potvrzovací flag. Neon `sql`
-- tagged template neumí skládat fragmenty (viz komentář v 048), takže
-- podmínka musí žít v databázi jako funkce, ne jako JS konstanta.

ALTER TABLE projects        ADD COLUMN IF NOT EXISTS business text NOT NULL DEFAULT 'vizeon';
ALTER TABLE projects        ADD COLUMN IF NOT EXISTS alteno_confirmed boolean DEFAULT false;

-- Kalendářní události nesou business přímo: událost z ALTENO poptávky nesmí
-- vyskočit ve VIZEON kalendáři. Ruční admin blokace (project_id IS NULL)
-- zůstávají díky defaultu u VIZEONu, kde je kalendář zobrazený.
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS business text NOT NULL DEFAULT 'vizeon';

-- consultation_slots vlastní sloupec nepotřebují — business se dohledá
-- joinem přes projects, ke kterým slot vždy patří.

CREATE INDEX IF NOT EXISTS idx_projects_business        ON projects (business);
CREATE INDEX IF NOT EXISTS idx_calendar_events_business ON calendar_events (business);

CREATE OR REPLACE FUNCTION is_alteno_pending(p_source text, p_alteno_confirmed boolean)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_source = 'alteno_web' AND (p_alteno_confirmed = false OR p_alteno_confirmed IS NULL)
$$;
