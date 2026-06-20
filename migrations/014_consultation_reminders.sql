-- Migration: add reminder flags to consultation_slots
-- Prevents duplicate sends if cron fires twice in an overlap window.

ALTER TABLE consultation_slots
  ADD COLUMN IF NOT EXISTS reminder_day_before_sent boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_2h_before_sent  boolean DEFAULT false;
