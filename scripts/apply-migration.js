#!/usr/bin/env node
// Obecný běhoun migrací: node scripts/apply-migration.js 053_invoices.sql 054_...
//
// Migrace v tomhle projektu jsou psané idempotentně (IF NOT EXISTS,
// DO $$ ... $$ guard na constrainty), takže opakovaný běh je bezpečný.
//
// Přepínače:
//   --dry     příkazy se jen vypíšou, nic se neprovede (ani evidence)
//   --znovu   aplikuje i migraci, která už je v evidenci
//
// Evidence: tabulka public.schema_migrations (soubor, čas, hash, počet
// příkazů). Běhoun ji sám založí a už aplikovanou migraci se stejným
// hashem přeskočí. Změněný soubor se pustí znovu (migrace jsou
// idempotentní) a hash v evidenci se přepíše.
//
// Neonový HTTP driver pošle jeden příkaz na request, proto se soubor
// rozdělí po středníkách. Splitter respektuje dollar-quoted bloky
// ($$ ... $$), aby se DO bloky s vnitřními středníky nerozsekaly.

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
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

const EVIDENCE = `CREATE TABLE IF NOT EXISTS public.schema_migrations (
  filename    text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now(),
  sha256      text NOT NULL,
  statements  integer NOT NULL
)`

async function main() {
  loadEnvLocal()
  if (!process.env.DATABASE_URL) {
    console.error('Chybí DATABASE_URL (.env.local nebo prostředí).')
    process.exit(1)
  }

  const args = process.argv.slice(2)
  const dry = args.includes('--dry')
  const znovu = args.includes('--znovu')
  const files = args.filter((a) => !a.startsWith('--'))
  if (files.length === 0) {
    console.error('Použití: node scripts/apply-migration.js [--dry] [--znovu] <soubor.sql> [další.sql ...]')
    process.exit(1)
  }

  const sql = neon(process.env.DATABASE_URL)
  // Host se vypisuje vždy — ať je na první pohled vidět, do které databáze se píše.
  let host = '(neznámý host)'
  try { host = new URL(process.env.DATABASE_URL).host } catch {}
  console.log(`Databáze: ${host}${dry ? '  (--dry, nic se nezapíše)' : ''}\n`)

  let applied = 0
  let skipped = 0

  if (!dry) await sql.query(EVIDENCE)

  const evidence = dry
    ? new Map()
    : new Map((await sql.query('SELECT filename, sha256 FROM public.schema_migrations')).map((r) => [r.filename, r.sha256]))

  for (const file of files) {
    const name = path.basename(file)
    // Cesta se bere, jak je zadaná (funguje i scripts/admin-base-schema.sql);
    // samotný název souboru se dohledá v migrations/.
    const filePath = fs.existsSync(file) ? file : path.join(__dirname, '..', 'migrations', name)
    if (!fs.existsSync(filePath)) {
      console.error(`Migrace ${file} neexistuje (${filePath}).`)
      process.exit(1)
    }
    const raw = fs.readFileSync(filePath, 'utf8')
    const hash = crypto.createHash('sha256').update(raw).digest('hex')
    const statements = splitStatements(raw)

    const known = evidence.get(name)
    if (known && !znovu) {
      if (known === hash) {
        console.log(`· ${name} — už aplikována, přeskočeno`)
        skipped++
        continue
      }
      console.log(`! ${name} — soubor se od aplikace změnil, pouštím znovu`)
    }

    console.log(`▶ ${name} — ${statements.length} příkaz(ů)`)
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
    if (!dry) {
      await sql.query(
        `INSERT INTO public.schema_migrations (filename, sha256, statements)
         VALUES ($1, $2, $3)
         ON CONFLICT (filename) DO UPDATE SET sha256 = EXCLUDED.sha256, statements = EXCLUDED.statements, applied_at = now()`,
        [name, hash, statements.length],
      )
    }
    console.log('  ✓ hotovo')
    applied++
  }

  console.log(`\n${dry ? 'Náhled hotov' : 'Hotovo'}: ${applied} aplikováno, ${skipped} přeskočeno.`)
}

main()
