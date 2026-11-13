#!/usr/bin/env node
// Hledá zakázky, které mají v ledgeru dva příjmy téhož druhu (AD13).
//
// Migrace 109 zakládá částečný unikátní index
// `finance_transactions_project_income_unique`: jedna zakázka má nejvýš
// jeden **zálohový** a jeden **doplatkový** příjem ze zakázky. Příjmy
// z faktur se mu vědomě netýkají — dílčí fakturace je legitimní.
//
// Jsou-li v datech duplicity, index se nevytvoří a migrace to jen vypíše
// (padat na tom nesmí, zbytek je potřeba pustit). Tenhle skript je najde,
// aby je člověk mohl rozhodnout. **Jen čte, nic nemaže.**
//
// Použití:
//   node scripts/admin-prijmy-duplicity.mjs
//   node scripts/admin-prijmy-duplicity.mjs --env .env.production
//
// Co s nálezem: dva příjmy téže zakázky a téhož druhu znamenají, že se
// tytéž peníze započítaly dvakrát (daňový základ je pak vyšší), **nebo**
// že jde o dvě skutečné platby, které měly vzniknout přes faktury. Rozhodne
// to člověk — podle výpisu z banky, ne podle čísel v tabulce.

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

// Druh příjmu se pozná i na databázi **bez** migrace 109: `income_origin`
// tam ještě není, ale příjem ze zakázky pozná vazba a kategorie.
const puvod = `CASE
  WHEN t.source_invoice_id IS NOT NULL THEN 'invoice'
  WHEN t.category = 'dokončený projekt' THEN 'completed'
  WHEN t.source_project_id IS NOT NULL THEN 'project'
  ELSE 'manual'
END`

const skupiny = await sql.query(
  `SELECT p.id::text AS zakazka,
          p.client_name AS klient,
          t.deposit_transaction AS zaloha,
          count(*)::int AS pocet,
          COALESCE(SUM(t.amount), 0)::text AS castka
   FROM finance_transactions t
   JOIN projects p ON p.id = t.source_project_id
   WHERE t.type = 'income'
     AND t.user_id IS NULL
     AND ${puvod} = 'project'
   GROUP BY 1, 2, 3
   HAVING count(*) > 1
   ORDER BY count(*) DESC, 2`,
)

if (skupiny.length === 0) {
  console.log('Žádná zakázka nemá dva příjmy téhož druhu — index z migrace 109 se vytvoří.')
  process.exit(0)
}

console.log(`Nalezeno ${skupiny.length} případů:\n`)
for (const s of skupiny) {
  console.log(`${s.klient} (${s.zakazka}) — ${s.zaloha ? 'zálohové' : 'doplatkové'} příjmy: ${s.pocet}× celkem ${s.castka}`)
  const radky = await sql.query(
    `SELECT t.id::text, t.date::text AS datum, t.amount::text AS castka, t.declared, t.note
     FROM finance_transactions t
     WHERE t.source_project_id = $1
       AND t.type = 'income'
       AND t.user_id IS NULL
       AND t.deposit_transaction = $2
       AND t.source_invoice_id IS NULL
       AND t.category <> 'dokončený projekt'
     ORDER BY t.date`,
    [s.zakazka, s.zaloha],
  )
  for (const r of radky) {
    console.log(`   ${r.datum}  ${r.castka}  ${r.declared ? 'přiznaný' : 'nepřiznaný'}  ${r.note ?? ''}  [${r.id}]`)
  }
  console.log('')
}
console.log('Rozhodnutí je na člověku: podle výpisu z banky zjistit, které řádky jsou tytéž peníze,')
console.log('a přebytečný příjem smazat ve Financích. Pak pustit migraci 109 znovu.')
