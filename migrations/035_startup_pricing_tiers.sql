-- 035: přidání pricing_tiers JSONB na startup_projects
ALTER TABLE startup_projects
  ADD COLUMN IF NOT EXISTS pricing_tiers JSONB DEFAULT '[]'::jsonb NOT NULL;
