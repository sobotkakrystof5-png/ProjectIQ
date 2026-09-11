#!/usr/bin/env node
// Obecný běhoun migrací: node scripts/apply-migration.js 053_invoices.sql 054_...
//
// Migrace v tomhle projektu jsou psané idempotentně (IF NOT EXISTS,
// DO $$ ... $$ guard na constrainty), takže opakovaný běh je bezpečný.
//
// S --dry se příkazy jen vypíšou, nic se neprovede.
//
// Neonový HTTP driver pošle jeden příkaz na request, proto se soubor
// rozdělí po středníkách. Splitter respektuje dollar-quoted bloky
// ($$ ... $$), aby se DO bloky s vnitřními středníky nerozsekaly.

const fs = require('fs')
const path = require('path')
const { neon } = require('@neondatabase/serverless')

// .env.local se čte ručně — dotenv není v závislostech projektu.
function loadEnvLocal() {
  const file = path.join(__dirname, '..', '.env.local')
  if (!fs.existsSync(file)) return
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    if (process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  }
}

function splitStatements(raw) {
  const statements = []
  let current = ''
  let dollarTag = null

  for (const rawLine of raw.split('\n')) {
    const line = dollarTag === null && rawLine.trim().startsWith('--') ? '' : rawLine
    let rest = line

    while (rest.length > 0) {
      if (dollarTag) {
        const end = rest.indexOf(dollarTag)
        if (end === -1) { current += rest + '\n'; rest = ''; break }
        current += rest.slice(0, end + dollarTag.length)
        rest = rest.slice(end + dollarTag.length)
        dollarTag = null
        continue
      }
      const open = rest.match(/\$[A-Za-z_]*\$/)
      const semi = rest.indexOf(';')
      if (open && (semi === -1 || open.index < semi)) {
        current += rest.slice(0, open.index + open[0].length)
        rest = rest.slice(open.index + open[0].length)
        dollarTag = open[0]
        continue
      }
      if (semi === -1) { current += rest + '\n'; rest = ''; break }
      current += rest.slice(0, semi)
      statements.push(current.trim())
      current = ''
      rest = rest.slice(semi + 1)
    }
    if (rest.length === 0 && !line.endsWith('\n')) current += '\n'
  }

  if (current.trim()) statements.push(current.trim())
  return statements.filter(Boolean)
}

async function main() {
  loadEnvLocal()
  if (!process.env.DATABASE_URL) {
    console.error('Chybí DATABASE_URL (.env.local nebo prostředí).')
    process.exit(1)
  }

  const args = process.argv.slice(2)
  const dry = args.includes('--dry')
  const files = args.filter((a) => a !== '--dry')
  if (files.length === 0) {
    console.error('Použití: node scripts/apply-migration.js [--dry] <soubor.sql> [další.sql ...]')
    process.exit(1)
  }

  const sql = neon(process.env.DATABASE_URL)

  for (const file of files) {
    const filePath = path.join(__dirname, '..', 'migrations', path.basename(file))
    if (!fs.existsSync(filePath)) {
      console.error(`Migrace ${file} neexistuje (${filePath}).`)
      process.exit(1)
    }
    const statements = splitStatements(fs.readFileSync(filePath, 'utf8'))
    console.log(`▶ ${path.basename(file)} — ${statements.length} příkaz(ů)`)
    for (const stmt of statements) {
      if (dry) { console.log(`  · ${stmt.replace(/\s+/g, ' ').slice(0, 100)}`); continue }
      try {
        await sql.query(stmt)
      } catch (err) {
        console.error(`  ✗ ${stmt.split('\n')[0].slice(0, 80)}…`)
        console.error(`    ${err.message}${err.code ? ` (${err.code})` : ''}`)
        process.exit(1)
      }
    }
    console.log('  ✓ hotovo')
  }

  console.log('\nVšechny migrace aplikovány.')
}

main()
