-- Migrace 089: Workspace — šablony ručních zpráv zákazníkům (RD16)
-- Rozšiřuje typy šablon uložených v message_settings. Aplikuje Kryštof po
-- předchozích migracích; tato migrace nebyla nasazena aplikací.

ALTER TABLE ws.message_settings DROP CONSTRAINT IF EXISTS message_settings_type_check;
ALTER TABLE ws.message_settings ADD CONSTRAINT message_settings_type_check CHECK (type IN (
  'request_received', 'booking_confirmed', 'booking_changed', 'reminder', 'thank_you',
  'reward_ready', 'invoice', 'new_request', 'daily_digest', 'weekly_digest', 'monthly_digest',
  'booking_declined', 'invoice_overdue', 'vat_limit', 'job_update',
  'customer_thanks', 'customer_booking', 'customer_offer', 'customer_job', 'customer_custom'
));
