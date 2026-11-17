-- Migrace 116: denní reporty hovorů z Growth OS do sekce AI asistent (R-118)
--
-- Growth OS (vizeon-autopilot) po každém kole volání a po posledním kole
-- za celý den pošle na `POST /api/public/outreach/reports` čísla dne
-- a jeden řádek za každý hovor. Admin z nich skládá AI asistent › Reporty
-- a Analýzu (kde hovory váznou, prompt pro Claude Code).
--
-- Plný text reportu se neukládá — je plný telefonů a e-mailů. Den se
-- vykresluje ze strukturovaných dat.
--
-- Osobní údaje: `outreach_calls.transcript` je přepis hovoru se skutečným
-- člověkem, kterému se volalo bez vyžádání. Ukládá se jen u hovorů, kde
-- někdo zvedl, a denní úklid ho po 90 dnech smaže (`purge_outreach_retention`).
-- Řádky hovorů bez přepisu zmizí po 12 měsících. Souhrnná čísla
-- (`outreach_reports`) osobní údaje nenesou a zůstávají.
--
-- Aditivní a idempotentní, smí jít na produkci před nasazením.
-- Bez ní endpoint vrátí 503 a záložky Reporty a Analýza se neukážou.

CREATE TABLE IF NOT EXISTS outreach_reports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date   date NOT NULL,
  -- 0 = souhrn celého dne, 1… = průběžný report po kole.
  round         integer NOT NULL DEFAULT 0,
  subject       text NOT NULL,
  stats         jsonb NOT NULL,
  rounds        jsonb NOT NULL DEFAULT '[]'::jsonb,
  segments      jsonb NOT NULL DEFAULT '{}'::jsonb,
  criteria      jsonb NOT NULL DEFAULT '[]'::jsonb,
  generated_at  timestamptz NOT NULL,
  received_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS outreach_reports_day_round_key
  ON outreach_reports (report_date, round);

CREATE TABLE IF NOT EXISTS outreach_calls (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- `vizeon-call:<id>`, nikdy se nemění.
  external_id         text NOT NULL,
  -- Stejný klíč jako outreach_leads.external_id (vazba se dělá při čtení:
  -- report smí přijít dřív než snímek firmy).
  lead_external_id    text NOT NULL,
  company_name        text NOT NULL,
  report_date         date NOT NULL,
  round               integer,
  called_at           timestamptz,
  -- Výsledek, jak ho pojmenovává autopilot: SOUHLAS, položil, nezvedl…
  result              text NOT NULL,
  duration_s          numeric,
  who_hung_up         text,
  hangup_at_s         numeric,
  intro_s             numeric,
  termination_reason  text,
  chance_level        text,
  chance_why          jsonb NOT NULL DEFAULT '[]'::jsonb,
  chance_action       text,
  -- Text od modelu o skutečném člověku: jen text, nikdy HTML.
  summary             text,
  objections          jsonb NOT NULL DEFAULT '[]'::jsonb,
  failed_criteria     jsonb NOT NULL DEFAULT '[]'::jsonb,
  segment             text,
  industry            text,
  opening_variant     text,
  transcript          jsonb,
  received_at         timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS outreach_calls_external_id_key
  ON outreach_calls (external_id);
CREATE INDEX IF NOT EXISTS outreach_calls_report_date_idx
  ON outreach_calls (report_date);
CREATE INDEX IF NOT EXISTS outreach_calls_lead_idx
  ON outreach_calls (lead_external_id);

-- Úklid osobních údajů: přepisy po 90 dnech, hovory po 12 měsících.
-- Volá ho denní cron `client-retention`. Vrací počet dotčených řádků.
CREATE OR REPLACE FUNCTION purge_outreach_retention()
RETURNS TABLE (transcripts integer, calls integer)
LANGUAGE plpgsql AS $$
DECLARE
  t integer;
  c integer;
BEGIN
  UPDATE outreach_calls SET transcript = NULL
   WHERE transcript IS NOT NULL AND report_date < (now() AT TIME ZONE 'Europe/Prague')::date - 90;
  GET DIAGNOSTICS t = ROW_COUNT;
  DELETE FROM outreach_calls
   WHERE report_date < (now() AT TIME ZONE 'Europe/Prague')::date - 365;
  GET DIAGNOSTICS c = ROW_COUNT;
  RETURN QUERY SELECT t, c;
END
$$;
