# AD01 — Úklid: pryč s tím, co se nepoužívá

## Cíl
Zmenšit admin dřív, než se začne překreslovat. Škola, Sport a zdraví, Plány a Šablony webu zmizí
z kódu i z databáze. Každý soubor smazaný tady je soubor, který se v AD04 nemusí přepisovat
a v AD17 překreslovat.

## Než začneš
Rituál začátku (`zakaziq-memory`): `git status`, `memory/index.md`, `memory/memory.md`, `memory/pravidla.md`.
Přečti `docs/admin/MODERNIZACE-ADMIN-PLAN.md` → AD01 a `docs/admin/AGENTS-ADMIN.md` → katalog tabulek.
Společná pravidla: `00-README.md`. Navazuje na AD00 (větev, testovací data, zelené testy).
Platí **R-089** (mazat včetně tabulek).

## Kroky

### 1. Export dat, než se cokoli smaže
Nový `scripts/export-before-drop.mjs`: vypíše obsah všech 25 tabulek do CSV **mimo repo**
(cesta jako parametr, výchozí `~/Desktop/zakaziq-export-<datum>/`). Dry-run výchozí.
**Bez potvrzeného exportu nepokračuj** — `DROP TABLE` je jediná nevratná věc v celém plánu.

### 2. Kód a stránky (jeden commit na oblast)
- **Škola:** `app/hub/school/**`, `app/api/cron/scrape-school/**`, `app/api/school/**`,
  `lib/lernsax.ts`, `lib/besteschule.ts`, `scripts/debug-lernsax.js`, složka `.debug-lernsax/`.
- **Sport a zdraví:** `app/hub/sport/**`, `app/api/fatsecret/**`, `lib/fatsecret.ts`.
- **Plány:** `app/hub/plany/**`, `scripts/apply-037-041-plans.js`.
- **Šablony webu:** `app/dashboard/sablony/**`, `app/dashboard/[id]/sablona/**`,
  `app/block-templates-actions.ts`, `app/project-blocks-actions.ts`,
  `components/{BlockTemplateLibrary,ProjectBlockList,BlockLibraryPicker}.tsx`,
  panel v `components/admin/project-detail-view.tsx:168–170, 199, 207–210`.
- **Dlaždice:** `app/hub/page.tsx` — `getSchoolStats`, `getSportStats`, `getPlanyStats` i jejich dlaždice.
- **Navigace:** `components/HubSidebarNav.tsx` (Škola, Sport, Plány), `lib/admin-nav.ts:42` (Šablony)
  a odpovídající řádky v `OLD_MENU_PATHS` v `lib/__tests__/admin-nav.test.ts`
  (ten test je **záměrná pojistka** — uprav ho vědomě, nemaž ho).
- **Cron:** `vercel.json` → `scrape-school`. Zbyde 6 cronů.
- **Typy:** `lib/types.ts` → `DeadlineType`, `DEADLINE_TYPE_LABEL`, `BlockTemplate`, `ProjectBlock`.
- **Připomínky:** `app/api/cron/send-reminders/route.ts:150–180` (`sendSchoolDeadlineReminder`)
  a `:305–335`.
- **Závislosti:** `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`.
- **Env:** `.env.example` → `FATSECRET_*` (mrtvé od 2026-06-22) a přihlašovací údaje do školy.

> **`puppeteer-core` a `@sparticuz/chromium` NEODSTRAŇUJ.** Scraper školy byl jejich jediný dnešní
> konzument, ale AD12 je potřebuje na generování PDF faktur.

### 3. Migrace (připravit, neaplikovat)
- **`migrations/100_uklid_skola_sport_plany.sql`** — `DROP TABLE IF EXISTS` pro: `school_grades`,
  `school_deadlines`, `school_messages`, `school_sync_log`, `school_timetable`,
  `school_grades_manual`, `school_deadlines_manual`, `nutrition_logs`, `workout_logs`,
  `health_scores`, `weight_logs`, `plan_school_goals`, `plan_school_goal_actions`, `plan_projects`,
  `plan_project_actions`, `plan_businesses`, `plan_business_phases`, `plan_health_goals`,
  `plan_health_goal_actions`, `plan_health_goal_logs`, `plan_finance_goals`,
  `plan_savings_snapshots`, `plan_wishlist_items`, `plans_legacy_archived`.
  Pozor na pořadí kvůli cizím klíčům (akce a logy před cíli).
- **`migrations/101_uklid_sablony.sql`** — `DROP TABLE IF EXISTS project_blocks, block_templates`.
- Obě idempotentní. **Aplikuje je Kryštof**, ty je jen připrav a ověř na testovací DB.

### 4. Ověření
`npx tsc --noEmit`, `npm test`, `npm run build`. V prohlížeči: `/hub` bez smazaných dlaždic,
detail zakázky bez panelu šablony, menu bez Šablon.

## Hotovo, když
- `git grep -l 'school_\|plan_\|nutrition_logs\|workout_logs\|health_scores\|weight_logs\|block_templates\|project_blocks'`
  vrací jen soubory v `migrations/`.
- Export do CSV leží mimo repo a Kryštof ho potvrdil.
- `npm test`, `tsc` i build zelené; žádný mrtvý import.
- Migrace 100 a 101 jsou připravené a vyzkoušené na testovací DB.

## Konec sezení
`zakaziq-memory` → Konec sezení. Stav AD01 v plánu (sekce 6), changelog v `memory/memory.md`
(u migrací uveď „aplikována: ne"). Commity `admin/uklid: …` po oblastech.
