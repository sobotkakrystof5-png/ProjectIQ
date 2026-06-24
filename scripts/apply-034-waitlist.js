#!/usr/bin/env node
require('dotenv').config({ path: '.env.local' });
const { neon } = require('@neondatabase/serverless');

const sql = neon(process.env.DATABASE_URL);

async function main() {
  console.log('Applying migration 034: startup_projects.waitlist_db_url');
  try {
    await sql`ALTER TABLE startup_projects ADD COLUMN IF NOT EXISTS waitlist_db_url TEXT`;
    console.log('Done.');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

main();
