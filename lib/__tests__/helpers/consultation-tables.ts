import fs from 'fs'
import path from 'path'
import type { PGlite } from '@electric-sql/pglite'

/**
 * Tabulky, které migrace 123 (KP14, konzultace z volna) potřebuje vedle
 * `projects`: kalendář, Hovory a rezervace ve stavu po migracích 001–115
 * (překryvové guardy 008/044/105, Meet z 115). Pro testy klientského
 * prostoru, které staví `projects` jen s několika sloupci — doplní i ty,
 * které čte `admin_slot_ensure_event`.
 */
export async function prepareConsultationTables(db: PGlite): Promise<void> {
  const root = path.resolve(__dirname, '../../..')
  const read = (file: string) => fs.readFileSync(path.join(root, 'migrations', file), 'utf8')
  await db.exec(`
    ALTER TABLE projects
      ADD COLUMN IF NOT EXISTS client_phone text,
      ADD COLUMN IF NOT EXISTS lead_origin text NOT NULL DEFAULT 'vizeon',
      ADD COLUMN IF NOT EXISTS contact_id uuid;
    CREATE TABLE IF NOT EXISTS admin_settings (id integer PRIMARY KEY DEFAULT 1);
    CREATE TABLE IF NOT EXISTS calendar_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      title text NOT NULL,
      description text,
      starts_at timestamptz NOT NULL,
      ends_at timestamptz NOT NULL,
      event_type text NOT NULL DEFAULT 'manual',
      project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
      lead_origin text NOT NULL DEFAULT 'vizeon',
      created_at timestamptz DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS client_leads (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      company_name text NOT NULL,
      contact_name text,
      phone text,
      email text,
      lead_status text DEFAULT 'cold',
      next_action text,
      next_action_date date,
      next_action_time time,
      next_action_type text,
      notes text,
      reminder_day_before_sent boolean DEFAULT false,
      reminder_2h_before_sent boolean DEFAULT false,
      contact_id uuid,
      calendar_event_id uuid REFERENCES calendar_events(id) ON DELETE SET NULL,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz
    );
    ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES client_leads(id) ON DELETE SET NULL;
    CREATE TABLE IF NOT EXISTS consultation_slots (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      scheduled_at timestamptz NOT NULL UNIQUE,
      channel text NOT NULL DEFAULT 'phone',
      channel_other_text text,
      client_wish text NOT NULL DEFAULT '',
      meeting_link text,
      client_email text,
      contact_id uuid,
      reminder_day_before_sent boolean NOT NULL DEFAULT false,
      reminder_2h_before_sent boolean NOT NULL DEFAULT false,
      created_at timestamptz DEFAULT now()
    );
  `)
  await db.exec(read('008_calendar_overlap_guard.sql'))
  await db.exec(read('044_cross_table_overlap_guard.sql'))
  await db.exec(read('105_propojeni_kalendar_hovory.sql'))
  await db.exec(read('115_schuzky_google_meet.sql'))
}
