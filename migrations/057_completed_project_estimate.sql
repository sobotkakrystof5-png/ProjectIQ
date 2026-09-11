-- Migration 057: odhadovaný čas u dokončené zakázky (Fáze 8 — Dokončené jako výkonnost)
--
-- `time_invested` už nese skutečně odpracované hodiny. `estimated_hours`
-- je volitelný odhad — kolik hodin se čekalo, když se zakázka brala.
-- Obě hodnoty spolu dovolují metriku „odhad vs. realita" v Dokončených.
--
-- Historická data mají hodnotu NULL — odhad se nedopočítává zpětně
-- (nebyl by to odhad, ale vymyšlené číslo). Karta v UI to počítá jen
-- z projektů, kde je vyplněné obojí.

ALTER TABLE completed_projects
  ADD COLUMN IF NOT EXISTS estimated_hours numeric;
