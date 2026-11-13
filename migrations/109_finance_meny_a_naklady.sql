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
