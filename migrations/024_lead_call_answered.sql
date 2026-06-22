-- Přidá sloupec call_answered do client_leads
-- null = nezaznamenáno, true = zvedl, false = nezvedl
ALTER TABLE client_leads ADD COLUMN IF NOT EXISTS call_answered boolean DEFAULT NULL;
