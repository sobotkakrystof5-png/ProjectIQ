-- Migration 007: Public booking API (vizeon.cz integration)
-- Run in Neon SQL Editor

ALTER TABLE projects ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual';

ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS api_requests (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  endpoint   text        NOT NULL,
  ip         text        NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_requests_endpoint_ip_created
  ON api_requests (endpoint, ip, created_at);
