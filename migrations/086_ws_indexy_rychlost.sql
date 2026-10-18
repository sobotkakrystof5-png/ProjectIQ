-- Migrace 086: Workspace — indexy pro rychlé obrazovky (RD03, R-058)
--
-- Nalezeno přes EXPLAIN (ANALYZE) na skutečných dotazech aplikace nad
-- syntetickými daty (2 účty, po 5 000 zákaznících a 20 000 poptávkách,
-- termínech a platbách na byznys):
--
-- 1. Seznam zákazníků (`getCustomersList`) čte pro každý z 300 řádků součet
--    plateb zákazníka. Bez indexu na zákazníkovi to byl 20 000řádkový průchod
--    plateb pro každý řádek (~1,9 ms × 300 ≈ 600 ms). → transactions_customer_idx.
-- 2. Peníze filtrují platby podle byznysu a data, ale index měl jen (účet,
--    byznys), takže polovinu řádků četly zbytečně. → transactions_business_day_idx
--    (nahrazuje transactions_account_business_idx, který je jeho začátkem).
-- 3. Živé obnovení se každých 10 s ptá na `max(updated_at)` poptávek, termínů
--    a zakázek. S indexem (účet, byznys, updated_at DESC) je to jedno čtení
--    z konce indexu místo průchodu všemi řádky. Nahrazuje indexy
--    *_account_business_idx (jsou jejich začátkem, takže ostatní dotazy
--    fungují dál).
--
-- 4. Seznam Poptávek čte pro každý z 200 řádků nejnovější termín poptávky
--    (`appointments.request_id`). Bez indexu to byl průchod všemi termíny
--    byznysu pro každý řádek (~2 ms × 200 ≈ 400 ms). → appointments_request_idx.
--
-- Idempotentní. Žádná data se nemění. CREATE INDEX krátce zamkne zápisy do
-- dané tabulky; při dnešním objemu jde o zlomky sekundy.

CREATE INDEX IF NOT EXISTS transactions_customer_idx
  ON ws.transactions (account_id, business_id, customer_id) WHERE customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS transactions_business_day_idx
  ON ws.transactions (account_id, business_id, occurred_on);
DROP INDEX IF EXISTS ws.transactions_account_business_idx;

CREATE INDEX IF NOT EXISTS requests_changed_idx ON ws.requests (account_id, business_id, updated_at DESC);
DROP INDEX IF EXISTS ws.requests_account_business_idx;

CREATE INDEX IF NOT EXISTS appointments_changed_idx ON ws.appointments (account_id, business_id, updated_at DESC);
DROP INDEX IF EXISTS ws.appointments_account_business_idx;

CREATE INDEX IF NOT EXISTS jobs_changed_idx ON ws.jobs (account_id, business_id, updated_at DESC);
DROP INDEX IF EXISTS ws.jobs_account_business_idx;

CREATE INDEX IF NOT EXISTS appointments_request_idx
  ON ws.appointments (account_id, request_id, created_at DESC) WHERE request_id IS NOT NULL;
