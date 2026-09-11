-- Migration 054: dvě linie příjmů — přiznané vs. nepřiznané
--
-- „Přiznané" = fakturováno na IČO, vstupuje do daňového přiznání.
-- Nemá to nic společného s DPH (uživatel není plátce DPH).
--
-- Proč příznak na transakci, a ne na faktuře: do nepřiznané linie musí
-- spadnout i zakázka, na kterou nikdy nebyla vystavena faktura. Kdyby
-- linie visela na existenci faktury, nepřiznané příjmy by se nedaly
-- evidovat vůbec.
--
-- DEFAULT false je záměr — historická data se nesmí sama označit za
-- přiznaná. Uživatel si je označí ručně, nebo zůstanou v nepřiznané linii.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS invoiced_on_ico boolean NOT NULL DEFAULT false;

ALTER TABLE finance_transactions
  ADD COLUMN IF NOT EXISTS declared boolean NOT NULL DEFAULT false;

-- Částečný index: daňové výpočty se ptají vždy jen na příjmy dané linie
-- za konkrétní rok, výdaje je nezajímají (uplatňuje se 60% paušál).
CREATE INDEX IF NOT EXISTS finance_transactions_declared_idx
  ON finance_transactions (declared, date) WHERE type = 'income';
