-- Migration: přidání času, typu akce a reminder příznaků na client_leads

ALTER TABLE client_leads
  ADD COLUMN IF NOT EXISTS next_action_time time,
  ADD COLUMN IF NOT EXISTS next_action_type text,
  ADD COLUMN IF NOT EXISTS reminder_day_before_sent boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_2h_before_sent  boolean DEFAULT false;
