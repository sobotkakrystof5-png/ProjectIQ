ALTER TABLE completed_projects
  ADD COLUMN IF NOT EXISTS deposit_amount numeric;
