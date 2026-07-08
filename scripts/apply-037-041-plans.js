#!/usr/bin/env node
require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const { neon } = require('@neondatabase/serverless');

const sql = neon(process.env.DATABASE_URL);

const MIGRATIONS = [
  '037_plan_school.sql',
  '038_plan_projects.sql',
  '039_plan_business.sql',
  '040_plan_health.sql',
  '041_plan_finance.sql',
];

async function main() {
  for (const file of MIGRATIONS) {
    const filePath = path.join(__dirname, '..', 'migrations', file);
    const raw = fs.readFileSync(filePath, 'utf8');
    const statements = raw
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n')
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean);

    console.log(`Applying ${file} (${statements.length} statement(s))...`);
    try {
      for (const stmt of statements) {
        await sql.query(stmt);
      }
      console.log(`  done.`);
    } catch (err) {
      console.error(`  Error in ${file}:`, err.message);
      process.exit(1);
    }
  }
  console.log('All migrations 037-041 applied.');
}

main();
