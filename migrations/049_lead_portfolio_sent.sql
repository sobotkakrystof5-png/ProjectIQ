-- Migration 049: track whether the "send portfolio" email was already sent to a lead
ALTER TABLE client_leads ADD COLUMN IF NOT EXISTS portfolio_sent_at timestamptz;
