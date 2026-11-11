#!/usr/bin/env node
// Záloha do CSV před smazáním tabulek (AD01, R-089). `DROP TABLE` je jediná
// nevratná věc celého plánu, proto se obsah nejdřív vyveze mimo repo.
//
//   node scripts/export-before-drop.mjs                      jen vypíše, co by vyvezl
//   node scripts/export-before-drop.mjs --ano                vyveze do ~/Desktop/zakaziq-export-<datum>/
//   node scripts/export-before-drop.mjs --ano --kam /cesta   vyveze jinam
//
// Jeden CSV soubor na tabulku (hlavička + řádky, UTF-8 s BOM, aby Excel
// nerozbil diakritiku), plus prehled.txt s počty řádků. Cílová složka nesmí
// být v repu — jinak by se záloha omylem commitla.
//
// Čte DATABASE_URL z .env.local (nebo z prostředí) a jen čte, nic nemaže.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { neon } from '@neondatabase/serverless'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

/** Tabulky, které smažou migrace 100 a 101. */
export const TABLES_TO_DROP = [
  // Škola (migrace 019, 020, 022, 025)
  'school_grades',
  'school_deadlines',
  'school_messages',
  'school_sync_log',
  'school_timetable',
  'school_grades_manual',
  'school_deadlines_manual',
  // Sport a zdraví (019, 021, 023)
  'nutrition_logs',
  'workout_logs',
  'health_scores',
  'weight_logs',
  // Plány (036–042)
  'plan_school_goals',
  'plan_school_goal_actions',
  'plan_projects',
  'plan_project_actions',
  'plan_businesses',
  'plan_business_phases',
  'plan_health_goals',
  'plan_health_goal_actions',
  'plan_health_goal_logs',
  'plan_finance_goals',
  'plan_savings_snapshots',
  'plan_wishlist_items',
  'plans_legacy_archived',
  // Šablony webu (061, 062)
  'block_templates',
  'project_blocks',
]

function loadEnvLocal() {
  const file = path.join(ROOT, '.env.local')
  if (!fs.existsSync(file)) return
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const cell = (value) => {
  if (value === null || value === undefined) return ''
  const text =
    value instanceof Date
      ? value.toISOString()
      : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value)
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function toCsv(rows) {
  const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))]
  const lines = [columns.join(',')]
  for (const row of rows) lines.push(columns.map((c) => cell(row[c])).join(','))
  return '﻿' + lines.join('\r\n') + '\r\n'
}

async function main() {
  loadEnvLocal()
  const args = process.argv.slice(2)
  const confirmed = args.includes('--ano')
  const whereIndex = args.indexOf('--kam')
  const today = new Date().toISOString().slice(0, 10)
  const target = path.resolve(
    whereIndex === -1 ? path.join(os.homedir(), 'Desktop', `zakaziq-export-${today}`) : args[whereIndex + 1],
  )

  if (!process.env.DATABASE_URL) {
    console.error('Chybí DATABASE_URL (.env.local nebo prostředí).')
    process.exit(1)
  }
  if (target === ROOT || target.startsWith(ROOT + path.sep)) {
    console.error(`Cíl ${target} je v repu — záloha musí ležet mimo něj.`)
    process.exit(1)
  }

  let host = '(neznámý host)'
  try {
    host = new URL(process.env.DATABASE_URL).host
  } catch {}
  console.log(`Databáze: ${host}`)
  console.log(`Cíl: ${target}${confirmed ? '' : '  (--ano chybí, nic se nezapíše)'}\n`)

  const sql = neon(process.env.DATABASE_URL)
  const existing = new Set(
    (
      await sql.query(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
      )
    ).map((r) => r.table_name),
  )

  if (confirmed) fs.mkdirSync(target, { recursive: true })

  const summary = []
  let total = 0
  for (const table of TABLES_TO_DROP) {
    if (!existing.has(table)) {
      console.log(`· ${table.padEnd(26)} v databázi není`)
      summary.push(`${table}\tv databázi není`)
      continue
    }
    // Sloupce typu `date` vrací ovladač jako Date v místním čase — přes
    // toISOString() by se datum posunulo o den. Proto je Postgres posílá jako text.
    const columns = await sql.query(
      `SELECT column_name, data_type FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
      [table],
    )
    const select = columns
      .map((c) =>
        c.data_type === 'date'
          ? `to_char("${c.column_name}", 'YYYY-MM-DD') AS "${c.column_name}"`
          : `"${c.column_name}"`,
      )
      .join(', ')
    const rows = await sql.query(`SELECT ${select} FROM ${table}`)
    total += rows.length
    console.log(`${rows.length > 0 ? '▶' : '·'} ${table.padEnd(26)} ${String(rows.length).padStart(6)} řádků`)
    summary.push(`${table}\t${rows.length} řádků`)
    if (confirmed && rows.length > 0) {
      fs.writeFileSync(path.join(target, `${table}.csv`), toCsv(rows))
    }
  }

  if (confirmed) {
    fs.writeFileSync(
      path.join(target, 'prehled.txt'),
      [
        `Záloha před migracemi 100 a 101 (ZakazIQ, AD01)`,
        `Databáze: ${host}`,
        `Vyvezeno: ${new Date().toISOString()}`,
        `Řádků celkem: ${total}`,
        '',
        ...summary,
        '',
        'Prázdné tabulky nemají soubor. CSV je UTF-8 s BOM, oddělovač čárka.',
      ].join('\n') + '\n',
    )
    console.log(`\nHotovo: ${total} řádků v ${target}`)
    console.log('Teprve potom jde aplikovat migrace 100 a 101.')
  } else {
    console.log(`\nDohromady ${total} řádků. Nic se nestalo — spusťte znovu s --ano.`)
  }
}

main().catch((e) => {
  console.error('Export selhal:', e instanceof Error ? e.message : e)
  process.exit(1)
})
