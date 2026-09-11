CREATE TABLE IF NOT EXISTS lead_notes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id uuid NOT NULL REFERENCES client_leads(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_notes_lead_idx ON lead_notes (lead_id, created_at DESC);

-- Backfill: existující notes se stanou prvním záznamem historie
INSERT INTO lead_notes (lead_id, content, created_at)
SELECT id, notes, COALESCE(updated_at, created_at)
FROM client_leads
WHERE notes IS NOT NULL AND btrim(notes) <> ''
  AND NOT EXISTS (SELECT 1 FROM lead_notes ln WHERE ln.lead_id = client_leads.id);
