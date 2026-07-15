-- Migration 035: persist the free-text description for channel = 'other'
--
-- bookingSchema validates channelOtherText and app/portal-actions.ts uses it
-- to build the admin/client confirmation emails, but the INSERT into
-- consultation_slots never stored it — it was lost as soon as the emails
-- were sent, with no trace left in the DB.

ALTER TABLE consultation_slots ADD COLUMN IF NOT EXISTS channel_other_text text;
