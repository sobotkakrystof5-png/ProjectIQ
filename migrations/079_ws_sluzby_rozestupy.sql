-- Migrace 079: Workspace — rozestup po službě (S13)
--
-- Rozestup prodlouží obsazený čas při hledání dalšího termínu. Výchozí nula
-- zachová chování všech existujících služeb.

ALTER TABLE ws.services
  ADD COLUMN IF NOT EXISTS buffer_min integer NOT NULL DEFAULT 0
  CHECK (buffer_min BETWEEN 0 AND 240);
