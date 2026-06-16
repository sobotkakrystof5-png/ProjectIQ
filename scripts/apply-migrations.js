#!/usr/bin/env node
require('dotenv').config({ path: '.env.local' });
const { neon } = require('@neondatabase/serverless');

const sql = neon(process.env.DATABASE_URL);

async function main() {
  console.log('🔍 Checking for existing calendar_events overlaps...');

  try {
    const overlaps = await sql`
      SELECT
        e1.id as id1, e1.title as title1, e1.starts_at, e1.ends_at,
        e2.id as id2, e2.title as title2
      FROM calendar_events e1
      JOIN calendar_events e2 ON
        e1.id < e2.id AND
        e1.starts_at < e2.ends_at AND
        e1.ends_at > e2.starts_at
      LIMIT 20
    `;

    if (overlaps.length > 0) {
      console.log('\n⚠️  Found overlapping calendar events:');
      overlaps.forEach(row => {
        console.log(`  - "${row.title1}" (${row.starts_at} → ${row.ends_at}) overlaps with "${row.title2}"`);
      });
      console.log('\n❌ Cannot apply migration 008 while overlaps exist.');
      console.log('   Delete or reschedule the conflicting events, then retry.');
      process.exit(1);
    } else {
      console.log('✅ No overlaps found. Safe to proceed.\n');
    }

    console.log('📋 Checking migration 007 status (vizeon fields)...');

    // Check if projects.source column exists and is populated
    const tableInfo = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name='projects' AND column_name='source'
    `;

    if (tableInfo.length > 0) {
      console.log('✅ Migration 007 (projects.source) already exists\n');
    } else {
      console.log('⚠️  Migration 007 fields not detected. Applying...');

      await sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual'`;
      await sql`ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id) ON DELETE SET NULL`;

      const apiReqTable = await sql`
        SELECT 1 FROM information_schema.tables
        WHERE table_name='api_requests'
      `;

      if (apiReqTable.length === 0) {
        await sql`
          CREATE TABLE api_requests (
            id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
            endpoint   text        NOT NULL,
            ip         text        NOT NULL,
            created_at timestamptz DEFAULT now()
          )
        `;
        await sql`
          CREATE INDEX idx_api_requests_endpoint_ip_created
            ON api_requests (endpoint, ip, created_at)
        `;
      }

      console.log('✅ Migration 007 applied\n');
    }

    console.log('🚀 Applying migration 008 (calendar_events overlap guard)...');

    await sql`CREATE EXTENSION IF NOT EXISTS btree_gist`;
    console.log('   ✓ btree_gist extension ensured');

    // Apply the exclusion constraint
    const constraintExists = await sql`
      SELECT 1 FROM pg_constraint
      WHERE conname = 'calendar_events_no_overlap'
    `;

    if (constraintExists.length === 0) {
      // Create a trigger function that prevents overlapping calendar events
      await sql`
        CREATE OR REPLACE FUNCTION check_calendar_overlap()
        RETURNS TRIGGER AS $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM calendar_events
            WHERE id != NEW.id
              AND starts_at < NEW.ends_at
              AND ends_at > NEW.starts_at
          ) THEN
            RAISE EXCEPTION 'Tento termín se překrývá s jinou událostí v kalendáři.';
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `;

      // Check if trigger exists, if not create it
      const triggerExists = await sql`
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'calendar_events_overlap_check'
      `;

      if (triggerExists.length === 0) {
        await sql`
          CREATE TRIGGER calendar_events_overlap_check
          BEFORE INSERT OR UPDATE ON calendar_events
          FOR EACH ROW
          EXECUTE FUNCTION check_calendar_overlap()
        `;
      }

      console.log('   ✓ Overlap prevention trigger created');
    } else {
      console.log('   ✓ Overlap prevention already exists');
    }

    console.log('\n✅ All migrations applied successfully!');
    console.log('\n📝 Next steps:');
    console.log('   1. Deploy to production');
    console.log('   2. Ensure VIZEON_API_KEY is set in env');
    console.log('   3. Test vizeon.cz integration');
  } catch (err) {
    console.error('\n❌ Error:', err.message);
    if (err.code) console.error('   Code:', err.code);
    process.exit(1);
  }
}

main();
