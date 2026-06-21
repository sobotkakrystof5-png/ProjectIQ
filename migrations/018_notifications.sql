-- Migration: tabulka oznámení pro admin dashboard
-- Eviduje veškeré aktivity: rezervace, hodnocení, vizeon, status změny, připomínky.

CREATE TABLE IF NOT EXISTS notifications (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  type       text NOT NULL,
  title      text NOT NULL,
  body       text,
  link       text,
  read       boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_unread_idx ON notifications (read, created_at DESC);
