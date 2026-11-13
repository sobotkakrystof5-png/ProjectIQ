-- Stav produkční databáze po nasazení AD00–AD13. **Jen čte, nic nemění.**
--
-- Stejné dotazy jako `node scripts/admin-stav-produkce.mjs`, ale k vložení
-- do SQL konzole Neonu — nepotřebuje connection string ani CLI. Pouštěj
-- dotazy po jednom, každý vrátí vlastní tabulku.
--
-- Vzniklo 2026-11-13: agent na produkční připojení nedosáhne, takže
-- „migrace jsou venku" je jinak jen něčí slovo.

-- 1) Které migrace má evidence běhounu. Když tabulka neexistuje, migrace
--    se pouštěly jinak než přes scripts/apply-migration.js.
SELECT filename, to_char(applied_at, 'YYYY-MM-DD HH24:MI') AS kdy
FROM public.schema_migrations
ORDER BY filename;

-- 2) Co je v databázi opravdu vidět, nezávisle na evidenci.
SELECT
  to_regclass('public.school_subjects') IS NULL
    AND to_regclass('public.project_blocks') IS NULL                        AS "100/101 úklid",
  EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='projects' AND column_name='lead_origin')        AS "102 jeden inbox",
  EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_trgm')               AS "103 indexy",
  to_regclass('public.contacts') IS NOT NULL                                AS "104 kontakty",
  EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='admin_lead_reschedule')      AS "105 kalendář↔hovory",
  EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='projects' AND column_name='closed_at')          AS "106 zakázka",
  EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='admin_invoice_issue')        AS "107 fakturace",
  EXISTS (SELECT 1 FROM pg_trigger
          WHERE tgname='trg_admin_invoice_undeletable')                     AS "108 nemazat",
  EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='finance_transactions' AND column_name='currency') AS "109 měny";

-- 3) Celá 109 po položkách. Index proti dvojímu příjmu ze zakázky se smí
--    nevytvořit — migrace to hlásí jen jako WARNING (R-099).
SELECT
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='finance_transactions' AND column_name='currency')      AS "ft.currency",
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='finance_transactions' AND column_name='income_origin') AS "ft.income_origin",
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='invoices' AND column_name='payment_origin')            AS "inv.payment_origin",
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='costs' AND column_name='archived_at')                  AS "costs.archived_at",
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='projects' AND column_name='paid_on')                   AS "projects.paid_on",
  EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='generate_recurring_costs')                                                   AS "generate_recurring_costs",
  EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='finance_transactions_invoice_unique')                                   AS "index na doklad",
  EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='finance_transactions_project_income_unique')                            AS "index na zakázku";

-- 4) DAŇOVÁ ČÍSLA. Měna se odvodí z faktury, která příjem založila —
--    přesně jako `derivedCurrency` v lib/admin/ledger.ts. Běží i na
--    databázi bez migrace 109.
--    `koruny` = co počítá nový kód. `vsechny_meny_secteny` = co počítal
--    starý kód. Rozdíl je chyba, která šla do daňového základu.
SELECT date_part('year', t.date)::int                                        AS rok,
       COALESCE((SELECT f.currency FROM invoices f WHERE f.id = t.source_invoice_id), 'CZK') AS mena,
       count(*)                                                              AS dokladu,
       SUM(t.amount)                                                         AS castka,
       SUM(t.amount) FILTER (WHERE t.declared)                               AS z_toho_priznano
FROM finance_transactions t
WHERE t.type = 'income' AND t.user_id IS NULL
GROUP BY 1, 2
ORDER BY 1 DESC, 2;

-- 5) Doprovodné kroky, na které se po migracích zapomíná.
SELECT (SELECT count(*) FROM contacts)                                        AS kontaktu,
       (SELECT count(*) FROM projects WHERE lead_pending)                     AS nepotvrzenych_poptavek,
       (SELECT count(*) FROM (
          SELECT 1 FROM finance_transactions t
          WHERE t.type='income' AND t.user_id IS NULL
            AND t.source_project_id IS NOT NULL
            AND t.source_invoice_id IS NULL
            AND t.category IS DISTINCT FROM 'dokončený projekt'
          GROUP BY t.source_project_id, t.deposit_transaction
          HAVING count(*) > 1) x)                                             AS zakazek_s_dvojim_prijmem;
