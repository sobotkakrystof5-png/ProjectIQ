-- Migration 021: Partial unique index for health_scores when user_id IS NULL
-- The table-level UNIQUE (user_id, scored_date) does NOT prevent duplicates when user_id IS NULL
-- because PostgreSQL treats NULL != NULL in unique constraints.
-- This partial index enforces uniqueness for the single-admin case.

CREATE UNIQUE INDEX IF NOT EXISTS health_scores_null_date_uq
  ON health_scores (scored_date) WHERE user_id IS NULL;
