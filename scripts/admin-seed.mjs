#!/usr/bin/env node
// Ukázková data pro admin konzoli (AD00) — fiktivní zakázky, hovory, termíny,
// faktury, náklady, dotazník a projekty Hubu kolem dneška, aby šlo admin
// otevřít v prohlížeči na čisté databázi.
//
//   node scripts/admin-seed.mjs                  jen vypíše, co by udělal
//   node scripts/admin-seed.mjs --ano            smaže starou ukázku a vloží novou
//   node scripts/admin-seed.mjs --smazat --ano   jen smaže ukázková data
//   node scripts/admin-seed.mjs --ano --i-s-daty  i když v DB jsou skutečné řádky
//
// Data jsou označená (lib/admin/demo-seed.ts: `[ukázková data]`, telefony
// +420000000xxx, e-maily @example.cz) a jiných řádků se skript nedotkne.
//
// Pojistka: když v `projects` nebo `client_leads` leží řádky bez značky,
// skript se zastaví — tak vypadá produkční databáze. Přebít jde --i-s-daty.
//
// Potřebuje Node 22.18+ (spouští lib/admin/demo-seed.ts bez překladu).

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { neon } from '@neondatabase/serverless'
import { DEMO_MARK, demoCleanupQueries, demoSeedQueries } from '../lib/admin/demo-seed.ts'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

// .env.local se čte ručně — dotenv není v závislostech projektu.
function loadEnvLocal() {
  const file = path.join(ROOT, '.env.local')
  if (!fs.existsSync(file)) return
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

function pragueToday() {
  // en-CA = YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Prague',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

async function main() {
  loadEnvLocal()
  const args = process.argv.slice(2)
  const confirmed = args.includes('--ano')
  const removeOnly = args.includes('--smazat')
  const evenWithRealData = args.includes('--i-s-daty')

  if (!process.env.DATABASE_URL) {
    console.error('Chybí DATABASE_URL v .env.local.')
    process.exit(1)
  }

  let host = '(neznámý host)'
  try {
    host = new URL(process.env.DATABASE_URL).host
  } catch {}
  console.log(`Databáze: ${host}`)

  const sql = neon(process.env.DATABASE_URL)
  const today = pragueToday()

  const [{ projects, leads }] = await sql.query(
    `SELECT (SELECT count(*) FROM projects     WHERE notes IS NULL OR notes NOT LIKE '%' || $1 || '%')::int AS projects,
            (SELECT count(*) FROM client_leads WHERE notes IS NULL OR notes NOT LIKE '%' || $1 || '%')::int AS leads`,
    [DEMO_MARK],
  )
  const realRows = projects + leads
  if (realRows > 0) {
    console.log(`Pozor: v databázi leží ${projects} zakázek a ${leads} hovorů bez značky ${DEMO_MARK} (skutečná data).`)
    if (!evenWithRealData) {
      console.error('Zastavuji — tohle nevypadá na testovací databázi. Pokračovat jde přepínačem --i-s-daty.')
      process.exit(1)
    }
  }

  const queries = removeOnly ? demoCleanupQueries() : demoSeedQueries({ today })
  const what = removeOnly ? 'smazat ukázková data' : 'smazat starou ukázku a vložit novou'

  if (!confirmed) {
    console.log(`Dnešek v Praze: ${today}`)
    console.log(`Chystám se ${what} (${queries.length} příkazů v jedné transakci).`)
    console.log('Nic se nestalo. Spusťte znovu s --ano.')
    return
  }

  await sql.transaction(queries.map((x) => sql.query(x.text, x.params)))
  console.log(`Hotovo: ${what} (${queries.length} příkazů).`)
  if (!removeOnly) {
    console.log('Otevřete /dashboard (přihlášení podle ADMIN_EMAIL v .env.local).')
    console.log('Smazání: node scripts/admin-seed.mjs --smazat --ano')
  }
}

main().catch((e) => {
  console.error('Seed selhal:', e instanceof Error ? e.message : e)
  process.exit(1)
})
