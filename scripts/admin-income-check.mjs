#!/usr/bin/env node
// Kontrola příjmů kolem migrace 106 (AD11).
//
// Migrace 106 sjednocuje Dokončené se zakázkami a sahá tím na čísla, ze
// kterých se počítá daň. Podmínka pro její přijetí zní: **součet příjmů za
// každý rok musí být po migraci na korunu stejný jako před ní.** Když
// nesedí, migrace se vrací.
//
// Použití:
//   node scripts/admin-income-check.mjs                 # vypíše součty
//   node scripts/admin-income-check.mjs --ulozit soubor.json
//   node scripts/admin-income-check.mjs --porovnat soubor.json
//
// Postup: před migrací `--ulozit pred.json`, po migraci `--porovnat pred.json`.
// Databáze se bere z `DATABASE_URL` v `.env.local`; jiný soubor přes `--env`.
// Skript **jen čte**.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { neon } from '@neondatabase/serverless'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const flag = (name) => {
  const i = args.indexOf(name)
  return i === -1 ? null : (args[i + 1] ?? '')
}

function loadEnv(which) {
  const file = path.isAbsolute(which) ? which : path.join(ROOT, which)
  if (!fs.existsSync(file)) {
    console.error(`Soubor ${which} neexistuje.`)
    process.exit(1)
  }
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

loadEnv(flag('--env') || '.env.local')
if (!process.env.DATABASE_URL) {
  console.error('Chybí DATABASE_URL.')
  process.exit(1)
}
const sql = neon(process.env.DATABASE_URL)

// Částky se čtou jako text, aby se cestou nic nezaokrouhlilo přes float.
const rows = await sql`
  SELECT to_char(date_trunc('year', date), 'YYYY') AS rok,
         count(*)::int AS pocet,
         COALESCE(SUM(amount), 0)::text AS castka
  FROM finance_transactions
  WHERE type = 'income' AND user_id IS NULL
  GROUP BY 1 ORDER BY 1
`
const celkem = await sql`
  SELECT count(*)::int AS pocet, COALESCE(SUM(amount), 0)::text AS castka
  FROM finance_transactions WHERE type = 'income' AND user_id IS NULL
`
const snapshot = {
  porizeno: new Date().toISOString(),
  roky: Object.fromEntries(rows.map((r) => [r.rok, { pocet: r.pocet, castka: r.castka }])),
  celkem: { pocet: celkem[0].pocet, castka: celkem[0].castka },
}

const vypis = () => {
  console.log('Příjmy (type=income, user_id IS NULL)')
  for (const [rok, v] of Object.entries(snapshot.roky)) {
    console.log(`  ${rok}  ${String(v.pocet).padStart(5)} transakcí  ${v.castka}`)
  }
  console.log(`  ----  ${String(snapshot.celkem.pocet).padStart(5)} transakcí  ${snapshot.celkem.castka}`)
}

const ulozit = flag('--ulozit')
const porovnat = flag('--porovnat')

if (porovnat) {
  const pred = JSON.parse(fs.readFileSync(porovnat, 'utf8'))
  vypis()
  const roky = [...new Set([...Object.keys(pred.roky), ...Object.keys(snapshot.roky)])].sort()
  const rozdily = []
  for (const rok of roky) {
    const a = pred.roky[rok] ?? { pocet: 0, castka: '0' }
    const b = snapshot.roky[rok] ?? { pocet: 0, castka: '0' }
    // Porovnání jako číslo, ne jako text: '1000' a '1000.00' je stejná koruna.
    if (Number(a.castka) !== Number(b.castka) || a.pocet !== b.pocet) {
      rozdily.push(`  ${rok}: před ${a.castka} (${a.pocet}×) → po ${b.castka} (${b.pocet}×)`)
    }
  }
  console.log('')
  if (rozdily.length === 0) {
    console.log(`Sedí na korunu. Snímek z ${pred.porizeno}.`)
  } else {
    console.log('NESEDÍ — migraci vraťte:')
    for (const r of rozdily) console.log(r)
    process.exit(1)
  }
} else {
  vypis()
  if (ulozit) {
    fs.writeFileSync(ulozit, JSON.stringify(snapshot, null, 2) + '\n')
    console.log(`\nUloženo do ${ulozit}.`)
  }
}
