#!/usr/bin/env node
require('dotenv').config({ path: '.env.local' });
const { neon } = require('@neondatabase/serverless');

const sql = neon(process.env.DATABASE_URL);

async function main() {
  console.log('Applying migration 042: rename plans -> plans_legacy_archived');
  try {
    await sql.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'plans')
           AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'plans_legacy_archived') THEN
          ALTER TABLE plans RENAME TO plans_legacy_archived;
        END IF;
      END $$;
    `);
    console.log('Done.');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

main();
