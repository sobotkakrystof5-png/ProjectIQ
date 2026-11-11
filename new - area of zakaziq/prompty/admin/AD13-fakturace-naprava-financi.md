# AD13 — Fakturace: náprava financí

## Cíl
Čísla ve financích se nesčítají přes měny, uložení faktury je jedna transakce a „po splatnosti“
se počítá na jednom místě.

## Než začneš
Rituál začátku. Přečti plán sekci 5 (AD13), `docs/FINANCE_SYSTEM_PLAN.md`, R-011, R-049.
Skill: `zakaziq-workspace-backend`.
Soubory: `lib/invoices.ts` (`syncInvoiceTransaction` :181, adopce :231), `app/hub/finance/invoice-actions.ts`,
`app/hub/finance/finance-actions.ts`, `app/actions.ts` (`declared` :248-251), `app/costs-actions.ts`,
`components/{InvoiceRegistry,InvoiceArchive,TaxCalculator}.tsx`, `migrations/088_*` (vzor `payment_origin`).

**Tohle sezení sahá na peníze.** Každý krok samostatný commit, každý s testem.

## Kroky
1. **Měna v ledgeru — nejdůležitější oprava celého plánu.** `finance_transactions` nemá `currency`,
   takže `syncInvoiceTransaction` vloží EUR částku bez přepočtu a **EUR faktura se sčítá s korunami**
   v `getBusinessIncome`, `getMonthlyAggregates` i v daňové kalkulačce. `InvoiceRegistry` přitom sčítá
   po měnách — dvě různé pravdy. **Migrace 104** (jen připravit): `finance_transactions.currency`
   s `DEFAULT 'CZK'`; součty přepsat na součty po měnách. Měny **nikdy nesčítej** (R-048).
2. **Jedna transakce.** Uložení faktury je dnes 4–6 samostatných dotazů bez transakce (insert →
   `loadInvoice` → hledání adoptovatelné transakce → insert/update `finance_transactions` → update
   vazby); pád mezi nimi nechá fakturu bez příjmu. Přepiš na jeden `adminDb.batch` z AD06.
3. **Jeden výpočet stavu.** Nový `lib/invoice-status.ts`: „po splatnosti“ se dnes počítá třemi
   různými způsoby (server `invoice-actions.ts:126` a `:182`, klient `InvoiceRegistry.isOverdue`,
   `InvoiceArchive`). Jedna čistá funkce, použít všude.
4. **Jeden SELECT.** Stejný 18sloupcový SELECT list s korelovaným subselectem je **4× zkopírovaný**
   → konstanta `invoiceSelect`.
5. **Adopce příjmu.** Dnes `WHERE t.amount = ${invoice.amount}` s `ORDER BY date DESC LIMIT 1` —
   záloha ani doplatek se neadoptuje a při dvou stejně vysokých příjmech může adoptovat ten špatný.
   Změň na výslovné „Je tohle ta platba?“ s nabídkou a přidej `payment_origin CHECK ('created','adopted')`
   podle migrace 088, aby bylo „Zpět“ bezpečné (8 s v UI, 60 s v DB).
6. **Testy na dosud nepokryté cesty** (dnes nulová ochrana): `syncInvoiceTransaction`,
   `parseInvoiceForm`, `insertInvoice`, `updateInvoiceRow`, dotazy v `invoice-actions.ts`,
   `app/costs-actions.ts`, `lib/recurring-transactions.ts`, `app/api/public/invoices`.
7. **Vědomě nech** a zapiš do plánu jako záměr: `updateProject` přepisuje `declared` všem transakcím
   zakázky (**potřebuje rozhodnutí C**, neměň potichu) · `declared` na šesti místech · obousměrná
   automatika `costs` ↔ `finance_transactions` · dvě sady daňových sazeb · `pdf_data bytea` v řádku.

## Hotovo, když
- EUR faktura se nikde nesčítá s korunami; součty jsou po měnách (test).
- Uložení faktury je jedna transakce; pád uprostřed nenechá fakturu bez příjmu (test).
- „Po splatnosti“ má jeden zdroj; `invoiceSelect` je na jednom místě.
- Testy pokrývají `syncInvoiceTransaction` a adopci platby včetně „Zpět“.
- Migrace 104 připravená (aplikována: ne).

## Konec sezení
`zakaziq-memory` → Konec sezení. Stav AD13 v plánu, changelog, co zůstalo vědomě nedořešené.
Commit `admin/fakturace: měny v ledgeru, atomické uložení, jeden výpočet stavu`.
