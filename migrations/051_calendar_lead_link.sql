-- Migration 051: propojení kalendářních událostí a kontaktů v Hovorech
--
-- Přidání termínu do globálního kalendáře (calendar_events) teď automaticky
-- založí odpovídající řádek v client_leads (Hovory, VIZEON), a smazání
-- jednoho smaže i druhý. Propojeno obousměrným nullable FK páru.

ALTER TABLE calendar_events
  ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES client_leads(id) ON DELETE SET NULL;

ALTER TABLE client_leads
  ADD COLUMN IF NOT EXISTS calendar_event_id uuid REFERENCES calendar_events(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS calendar_events_lead_id_key
  ON calendar_events(lead_id) WHERE lead_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS client_leads_calendar_event_id_key
  ON client_leads(calendar_event_id) WHERE calendar_event_id IS NOT NULL;
