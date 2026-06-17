-- Migration 009: client_phone and service_type fields for vizeon.cz integration
-- Run in Neon SQL Editor

ALTER TABLE projects ADD COLUMN IF NOT EXISTS client_phone text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS service_type text;
