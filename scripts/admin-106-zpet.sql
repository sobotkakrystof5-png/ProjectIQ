-- Návrat přejmenování z migrace 106 (AD11) — pro případ, že se 106 pustila
-- na produkci dřív, než se tam nasadila větev `admin/modernizace`.
--
-- PROČ: 106 je stejně jako 102 **nekompatibilní se starým buildem**. Produkce
-- běží na buildu `d948400`, který tabulku `completed_projects` čte i zapisuje.
-- Po přejmenování na `completed_projects_archiv` tam padá:
--   * `/dashboard/dokoncene` a `/dashboard/hodnoceni` (admin, za přihlášením),
--   * `/dashboard/profil` a výkonnost byznysu ve Financích,
--   * „Přidat do dokončených" na detailu zakázky,
--   * **`/h/[token]` — veřejný dotazník spokojenosti**, který klienti dostali
--     e-mailem. Tohle je jediná část navenek, proto má přednost.
--
-- CO TOHLE SQL DĚLÁ: vrátí **jen název tabulky**. Zbytek migrace 106 je
-- aditivní (nové sloupce na `projects` a `project_surveys`, nové řádky zakázek
-- z ručně doplněné historie) a starému buildu nevadí — `SELECT *` sloupec navíc
-- snese a nové zakázky jsou obyčejné řádky. **Žádný příjem ani jiné číslo se
-- nemění**; 106 do `finance_transactions` nikdy nic nevkládá ani nemaže.
--
-- Druhý příkaz vyškrtne 106 z evidence, aby ji běhoun po nasazení větve pustil
-- znovu. Migrace je idempotentní (`migrated_project_id` si pamatuje, co už
-- vzniklo), takže druhý běh nic nezdvojí.
--
-- SPUŠTĚNÍ (Neon konzole produkčního projektu, nebo s produkčním připojením):
--   vercel env pull .env.production.local --environment=production
--   psql "$DATABASE_URL" -f scripts/admin-106-zpet.sql
--
-- POTOM: ověřit, že součty příjmů sedí:
--   node scripts/admin-income-check.mjs --env .env.production.local
--
-- SPRÁVNÉ POŘADÍ PŘÍŠTĚ: nasadit větev `admin/modernizace`, pak 102, pak 106.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.completed_projects_archiv') IS NOT NULL
     AND to_regclass('public.completed_projects') IS NULL THEN
    ALTER TABLE completed_projects_archiv RENAME TO completed_projects;
    RAISE NOTICE 'completed_projects_archiv → completed_projects (vráceno).';
  ELSE
    RAISE NOTICE 'Není co vracet: archiv neexistuje, nebo původní tabulka už je zpátky.';
  END IF;
END
$$;

DELETE FROM public.schema_migrations WHERE filename = '106_zakazka_jedina_pravda.sql';

COMMIT;
