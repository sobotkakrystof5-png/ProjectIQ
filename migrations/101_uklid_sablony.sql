-- 101: Úklid — Šablony webu (AD01, R-089).
--
-- Knihovna typů bloků (`block_templates`) a bloky u zakázky (`project_blocks`)
-- se nepoužívají; stránky /dashboard/sablony a /dashboard/[id]/sablona i panel
-- v detailu zakázky odešly v commitu `admin/uklid: Šablony webu pryč z kódu`.
--
-- POZOR: před spuštěním vyvezte obsah do CSV mimo repo:
--
--     node scripts/export-before-drop.mjs --ano
--
-- `project_blocks` má cizí klíč na `block_templates`, proto jde první.
-- Bez CASCADE, s IF EXISTS (idempotentní).

DROP TABLE IF EXISTS project_blocks;
DROP TABLE IF EXISTS block_templates;
