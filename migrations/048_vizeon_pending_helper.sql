-- Migration 038: shared "is this a pending Vizeon booking" check
--
-- The condition `source = 'vizeon_web' AND (vizeon_confirmed = false OR
-- vizeon_confirmed IS NULL)` was hand-copied as raw SQL across 7 files.
-- The neon serverless driver's `sql` tagged template does not support
-- composing query fragments (each sql`...` call resolves to its own
-- request), so the condition can't be shared as a JS constant — it has to
-- live in the database as a function that every query calls instead.

CREATE OR REPLACE FUNCTION is_vizeon_pending(p_source text, p_vizeon_confirmed boolean)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_source = 'vizeon_web' AND (p_vizeon_confirmed = false OR p_vizeon_confirmed IS NULL)
$$;
