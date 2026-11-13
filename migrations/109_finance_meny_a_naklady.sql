-- Migrace 109 (AD13): náprava financí
--
-- Idempotentní, aditivní a zpětně kompatibilní: dokud nedoběhne, chová se
-- admin jako dřív (viz `hasLedgerCurrency()` v `lib/admin/ledger.ts`).
--
-- ── A. Měna v ledgeru ────────────────────────────────────────────────────
--
-- `finance_transactions` neměla měnu, zatímco faktura ano. Zaplacená faktura
-- v eurech tak vložila do ledgeru číslo bez měny a `getBusinessIncome`,
-- `getMonthlyAggregates` i daňová kalkulačka ho sečetly s korunami. Evidence
-- faktur přitom sčítá po měnách — dvě různé pravdy o týchž penězích a ta
-- horší z nich šla do daňového základu.
--
-- Měny se nesčítají (R-048). Po migraci je měna součástí řádku, součty jedou
-- po měnách a do daní vstupují jen koruny.

ALTER TABLE finance_transactions
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'CZK';

DO $$ BEGIN
  ALTER TABLE finance_transactions
    ADD CONSTRAINT finance_transactions_currency_check
    CHECK (currency IN ('CZK', 'EUR'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Zpětné doplnění jen tam, kde je původ jistý: transakci založila faktura
-- (`source_invoice_id`), takže nese její měnu. Všechno ostatní vzniklo
-- v korunách (zakázky, náklady, opakované položky, ruční zápis) a výchozí
-- hodnota je u nich správná.
UPDATE finance_transactions t
SET currency = i.currency
FROM invoices i
WHERE t.source_invoice_id = i.id
  AND i.currency IS NOT NULL
  AND t.currency IS DISTINCT FROM i.currency;

-- Převzatý příjem se **nepřepisuje**: patří zakázce a ta ho zapsala
-- v korunách. Kdyby ho kdysi převzala faktura v eurech (adopce porovnávala
-- jen částku, ne měnu), je to chyba v datech, ne v měně řádku — migrace ji
-- proto jen vypíše a nechá člověku.
DO $$
DECLARE podezrele int;
BEGIN
  SELECT count(*) INTO podezrele
  FROM invoices i
  JOIN finance_transactions t ON t.id = i.finance_transaction_id
  WHERE t.source_invoice_id IS DISTINCT FROM i.id
    AND i.currency <> 'CZK';

  IF podezrele > 0 THEN
    RAISE NOTICE 'Pozor: % faktur v cizí měně převzalo korunový příjem zakázky. Zkontrolujte je ručně (SELECT i.invoice_number, i.currency, i.amount FROM invoices i JOIN finance_transactions t ON t.id = i.finance_transaction_id WHERE t.source_invoice_id IS DISTINCT FROM i.id AND i.currency <> ''CZK'').', podezrele;
  END IF;
END $$;

-- Daňové a přehledové dotazy se ptají na „příjmy v korunách za rok".
CREATE INDEX IF NOT EXISTS finance_transactions_currency_date_idx
  ON finance_transactions (currency, date) WHERE type = 'income';

-- ── B. Náklad má svou dobu platnosti ────────────────────────────────────
--
-- `costs` nesla jen „kolik a jak často", ne „odkdy dokdy". Dvě věci z toho
-- plynuly:
--
--   1. `updateCost` končila větví `DELETE FROM finance_transactions
--      WHERE source_cost_id = …`, takže **jakákoli** editace fixního nákladu
--      (i pouhé přejmenování) smazala všechny jeho vygenerované měsíční
--      výdaje a cron pak dogeneroval jen ten aktuální. Historie tiše zmizela.
--   2. Generátor znal jen `CURRENT_DATE`, takže vynechaný měsíc (cron
--      neproběhl, náklad se přidal později) se už nikdy nedoplnil.
--
-- Změna částky proto platí od aktuální periody dál, přejmenování přepíše
-- jen popis a smazání nákladu s historií znamená archivaci, ne `DELETE`.

ALTER TABLE costs ADD COLUMN IF NOT EXISTS incurred_on date;
ALTER TABLE costs ADD COLUMN IF NOT EXISTS starts_on date;
ALTER TABLE costs ADD COLUMN IF NOT EXISTS ends_on date;
ALTER TABLE costs ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- Historie: co už v tabulce je, platí od svého vzniku.
UPDATE costs SET starts_on = created_at::date WHERE starts_on IS NULL;
UPDATE costs SET incurred_on = created_at::date WHERE incurred_on IS NULL AND cost_type = 'one_time';

DO $$ BEGIN
  ALTER TABLE costs ADD CONSTRAINT costs_obdobi_check CHECK (ends_on IS NULL OR starts_on IS NULL OR ends_on >= starts_on);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS costs_aktivni_idx ON costs (cost_type) WHERE archived_at IS NULL;

-- ── C. Opakované náklady se dají doplnit zpětně ─────────────────────────
--
-- Jedna funkce místo dvou `INSERT … SELECT` nad `CURRENT_DATE`: projde
-- periody od `starts_on` po `least(ends_on, p_until)` a chybějící doplní.
-- Idempotenci drží `UNIQUE (source_cost_id, recurring_period)` z migrace 030,
-- takže se smí pouštět opakovaně. Strop `p_max_months` je pojistka proti
-- nákladu s nesmyslně starým `starts_on` — bez něj by jedno překlepnuté
-- datum vyrobilo tisíce řádků.
--
-- Archivovaný náklad (`archived_at`) se negeneruje; `ends_on` je poslední
-- den, za který ještě výdaj patří.
CREATE OR REPLACE FUNCTION public.generate_recurring_costs(
  p_until date DEFAULT CURRENT_DATE,
  p_max_months int DEFAULT 36
) RETURNS int LANGUAGE plpgsql AS $$
DECLARE vlozeno int := 0; pridano int;
BEGIN
  IF p_max_months < 1 THEN p_max_months := 1; END IF;

  -- Měsíční: jedna transakce na kalendářní měsíc, 1. dne.
  WITH obdobi AS (
    SELECT c.id, c.amount, c.name, mesic::date AS den, to_char(mesic, 'YYYY-MM') AS perioda
    FROM costs c
    CROSS JOIN LATERAL generate_series(
      greatest(
        date_trunc('month', COALESCE(c.starts_on, c.created_at::date)),
        date_trunc('month', p_until::timestamp) - make_interval(months => p_max_months - 1)
      ),
      date_trunc('month', least(COALESCE(c.ends_on, p_until), p_until)::timestamp),
      interval '1 month'
    ) AS mesic
    WHERE c.cost_type = 'fixed_monthly'
      AND c.archived_at IS NULL
      AND c.amount > 0
  )
  INSERT INTO finance_transactions
    (amount, type, category, note, date, user_id, source_cost_id, recurring_period)
  SELECT o.amount::numeric, 'expense', 'fixní náklady', o.name, o.den, NULL, o.id, o.perioda
  FROM obdobi o
  ON CONFLICT (source_cost_id, recurring_period) DO NOTHING;
  GET DIAGNOSTICS pridano = ROW_COUNT;
  vlozeno := vlozeno + pridano;

  -- Roční: jedna transakce na kalendářní rok, 1. ledna.
  WITH obdobi AS (
    SELECT c.id, c.amount, c.name, rok::date AS den, to_char(rok, 'YYYY') AS perioda
    FROM costs c
    CROSS JOIN LATERAL generate_series(
      greatest(
        date_trunc('year', COALESCE(c.starts_on, c.created_at::date)),
        date_trunc('year', p_until::timestamp) - make_interval(months => p_max_months - 1)
      ),
      date_trunc('year', least(COALESCE(c.ends_on, p_until), p_until)::timestamp),
      interval '1 year'
    ) AS rok
    WHERE c.cost_type = 'fixed_annual'
      AND c.archived_at IS NULL
      AND c.amount > 0
  )
  INSERT INTO finance_transactions
    (amount, type, category, note, date, user_id, source_cost_id, recurring_period)
  SELECT o.amount::numeric, 'expense', 'fixní náklady', o.name, o.den, NULL, o.id, o.perioda
  FROM obdobi o
  ON CONFLICT (source_cost_id, recurring_period) DO NOTHING;
  GET DIAGNOSTICS pridano = ROW_COUNT;
  vlozeno := vlozeno + pridano;

  RETURN vlozeno;
END $$;
