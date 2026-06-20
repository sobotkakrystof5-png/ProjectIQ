DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'costs' AND column_name = 'category'
  ) THEN
    ALTER TABLE costs ADD COLUMN category text NOT NULL DEFAULT 'all';
  END IF;
END $$;
