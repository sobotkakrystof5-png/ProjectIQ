-- Upomínkový příznak pro manuální školní termíny
-- Cron send-reminders posílá email + notifikaci den před due_date

ALTER TABLE school_deadlines_manual
  ADD COLUMN IF NOT EXISTS reminder_day_before_sent boolean NOT NULL DEFAULT false;
