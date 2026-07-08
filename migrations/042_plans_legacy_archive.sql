-- Přejmenování staré ploché tabulky `plans` po migraci dat do `plan_projects` (migrace 038).
-- Data se NEmažou, jen se archivuje název tabulky pro budoucí referenci.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'plans')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'plans_legacy_archived') THEN
    ALTER TABLE plans RENAME TO plans_legacy_archived;
  END IF;
END $$;
