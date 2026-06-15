-- Migration: client_feedback, consultation_slots, client_email column
-- Run in Neon SQL Editor

CREATE TABLE IF NOT EXISTS client_feedback (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  nps integer NOT NULL CHECK (nps >= 1 AND nps <= 10),
  content text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS consultation_slots (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scheduled_at timestamptz NOT NULL,
  channel text NOT NULL CHECK (channel IN ('whatsapp', 'teams', 'meet', 'phone')),
  client_wish text NOT NULL,
  meeting_link text,
  client_email text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (project_id, scheduled_at)
);

ALTER TABLE projects ADD COLUMN IF NOT EXISTS client_email text;
