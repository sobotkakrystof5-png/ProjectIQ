-- Migration 056: vlastnictví příjmové transakce založené fakturou
--
-- Faktura se zaplacením zakládá příjem v ledgeru. Aby se příjem nezapočetl
-- dvakrát (Past č. 2 v plánu), musí jít rozlišit dva případy:
--
--   1. Transakci vytvořila faktura  → `source_invoice_id` ukazuje na fakturu.
--      Zrušení `paid_on` nebo smazání faktury tu transakci maže.
--   2. Transakci už měla zakázka    → faktura ji jen převezme (naváže se přes
--      `invoices.finance_transaction_id`) a `source_invoice_id` zůstane NULL.
--      Zrušení `paid_on` vazbu jen rozváže, transakci nechá být — patří zakázce.
--
-- Dvojice sloupců tedy nese dvě různé věci:
--   `invoices.finance_transaction_id`      — která transakce fakturu v ledgeru zastupuje
--   `finance_transactions.source_invoice_id` — kdo tu transakci založil
--
-- ON DELETE SET NULL: smazání faktury nesmí shodit příjem, který zůstává
-- platný (peníze reálně dorazily). Úklid vlastněné transakce dělá aplikace
-- explicitně před smazáním faktury.

ALTER TABLE finance_transactions
  ADD COLUMN IF NOT EXISTS source_invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS finance_transactions_invoice_idx
  ON finance_transactions (source_invoice_id);
