-- Migration 015: vizeon_confirmed flag for staging incoming Vizeon bookings
-- Run in Neon SQL Editor

ALTER TABLE projects ADD COLUMN IF NOT EXISTS vizeon_confirmed boolean DEFAULT false;
