DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'estimated_costs'
  ) THEN
    ALTER TABLE projects ADD COLUMN estimated_costs numeric;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'deposit_amount'
  ) THEN
    ALTER TABLE projects ADD COLUMN deposit_amount numeric;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'deposit_paid'
  ) THEN
    ALTER TABLE projects ADD COLUMN deposit_paid boolean DEFAULT false;
  END IF;
END $$;
