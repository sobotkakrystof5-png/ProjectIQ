-- Přidá pole pro propojení startup projektu s externím waitlist Neon DB
ALTER TABLE startup_projects ADD COLUMN IF NOT EXISTS waitlist_db_url TEXT;
