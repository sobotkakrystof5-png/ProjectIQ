#!/usr/bin/env node
// Obecný běhoun migrací: node scripts/apply-migration.js 053_invoices.sql 054_...
//
// Migrace v tomhle projektu jsou psané idempotentně (IF NOT EXISTS,
// DO $$ ... $$ guard na constrainty), takže opakovaný běh je bezpečný.
//
// S --dry se příkazy jen vypíšou, nic se neprovede.
//
// Soubor se rozdělí po středníkách a příkazy běží po jednom (stejně jako
// dřív v Neonu), aby chybová hláška ukázala, který příkaz selhal. Splitter
// respektuje dollar-quoted bloky ($$ ... $$), aby se DO bloky s vnitřními
// středníky nerozsekaly.
//
// DATABASE_URL = vlastník tabulek v Supabase (role postgres).

const fs = require('fs')
const path = require('path')
const { connect, loadEnvLocal, ownerDatabaseUrl } = require('./lib/db')

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
  const ownerUrl = ownerDatabaseUrl()
  if (!ownerUrl) {
    console.error('Chybí DATABASE_URL nebo POSTGRES_URL (.env.local nebo prostředí).')
    process.exit(1)
  }

  const args = process.argv.slice(2)
  const dry = args.includes('--dry')
  const files = args.filter((a) => a !== '--dry')
  if (files.length === 0) {
    console.error('Použití: node scripts/apply-migration.js [--dry] <soubor.sql> [další.sql ...]')
    process.exit(1)
  }

  const sql = connect(ownerUrl)

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
  await sql.end()
}

main()
