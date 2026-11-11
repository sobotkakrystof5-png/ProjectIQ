-- 100: Úklid — Škola, Sport a zdraví, Plány (AD01, R-089).
--
-- Kryštof tyhle moduly nepoužívá a v modernizaci adminu by jinak vstoupily
-- do codemodu barev (AD04) i do překreslování obrazovek (AD17). Kód odešel
-- v commitech `admin/uklid: …`, tady mizí 24 tabulek.
--
-- POZOR: DROP TABLE je jediná nevratná věc celého plánu. Před spuštěním
-- vyvezte obsah do CSV mimo repo:
--
--     node scripts/export-before-drop.mjs --ano
--
-- Pořadí respektuje cizí klíče (akce a logy před cíli), takže není potřeba
-- CASCADE — a tím ani riziko, že DROP vezme s sebou něco, co má zůstat.
-- IF EXISTS dělá migraci idempotentní (opakovaný běh nic nerozbije).
--
-- Co zůstává: `startup_projects` (odkazuje na ni `plan_businesses`, ne naopak),
-- `puppeteer-core` a `@sparticuz/chromium` v závislostech (AD12 je potřebuje
-- na PDF faktur), `finance_transactions` s kategorií „sport / výživa"
-- (to jsou peníze, ne modul Sport).

-- ── Škola (migrace 019, 020, 022, 025) ──────────────────────────────────────
DROP TABLE IF EXISTS school_grades;
DROP TABLE IF EXISTS school_deadlines;
DROP TABLE IF EXISTS school_messages;
DROP TABLE IF EXISTS school_sync_log;
DROP TABLE IF EXISTS school_timetable;
DROP TABLE IF EXISTS school_grades_manual;
DROP TABLE IF EXISTS school_deadlines_manual;

-- ── Sport a zdraví (migrace 019, 021, 023) ──────────────────────────────────
DROP TABLE IF EXISTS nutrition_logs;
DROP TABLE IF EXISTS workout_logs;
DROP TABLE IF EXISTS health_scores;
DROP TABLE IF EXISTS weight_logs;

-- ── Plány (migrace 036–042) — děti před rodiči ──────────────────────────────
DROP TABLE IF EXISTS plan_school_goal_actions;
DROP TABLE IF EXISTS plan_school_goals;

DROP TABLE IF EXISTS plan_business_phases;
DROP TABLE IF EXISTS plan_businesses;
DROP TABLE IF EXISTS plan_project_actions;
DROP TABLE IF EXISTS plan_projects;

DROP TABLE IF EXISTS plan_health_goal_actions;
DROP TABLE IF EXISTS plan_health_goal_logs;
DROP TABLE IF EXISTS plan_health_goals;

DROP TABLE IF EXISTS plan_finance_goals;
DROP TABLE IF EXISTS plan_savings_snapshots;
DROP TABLE IF EXISTS plan_wishlist_items;
DROP TABLE IF EXISTS plans_legacy_archived;
