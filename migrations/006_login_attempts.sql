-- Migration 006: Brute-force lockout for /login
-- Run in Neon SQL Editor

CREATE TABLE IF NOT EXISTS login_attempts (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  ip         text        NOT NULL,
  success    boolean     NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_created
  ON login_attempts (ip, created_at);
