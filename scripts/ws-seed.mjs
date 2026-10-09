#!/usr/bin/env node
// Ukázková data pro Workspace (S09) — fiktivní zákazníci, poptávky a termíny
// kolem dneška pro jeden byznys, aby šla vyzkoušet obrazovka Dnes.
//
//   node scripts/ws-seed.mjs <slug-byznysu>            jen vypíše, co by udělal
//   node scripts/ws-seed.mjs <slug-byznysu> --ano      smaže starou ukázku a vloží novou
//   node scripts/ws-seed.mjs <slug-byznysu> --smazat --ano   jen smaže ukázková data
//
// Data jsou označená (lib/ws/demo-seed.ts) a jiných řádků se skript nedotkne.
// Byznys se dohledá rolí vlastníka (DATABASE_URL), zápis jde rolí ws_app
// (DATABASE_URL_WS) pod Row Level Security, stejně jako aplikace.
//
// Pozor: DATABASE_URL v .env.local míří na produkční Neon. Pouštět jen na
// vlastním testovacím účtu.
//
// Potřebuje Node 22.18+ (spouští lib/ws/demo-seed.ts bez překladu).

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { neon } from '@neondatabase/serverless'
import { demoCleanupQueries, demoSeedQueries } from '../lib/ws/demo-seed.ts'

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
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Prague',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
  return parts // en-CA = YYYY-MM-DD
}

async function main() {
  loadEnvLocal()
  const args = process.argv.slice(2)
  const slug = args.find((a) => !a.startsWith('--'))
  const confirmed = args.includes('--ano')
  const removeOnly = args.includes('--smazat')

  if (!slug || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
    console.error('Použití: node scripts/ws-seed.mjs <slug-byznysu> [--smazat] --ano')
    process.exit(1)
  }
  for (const name of ['DATABASE_URL', 'DATABASE_URL_WS']) {
    if (!process.env[name]) {
      console.error(`Chybí ${name} v .env.local (docs/workspace/SETUP.md).`)
      process.exit(1)
    }
  }

  const owner = neon(process.env.DATABASE_URL)
  const rows = await owner.query('SELECT id, account_id, name FROM ws.businesses WHERE slug = $1', [slug])
  const business = rows[0]
  if (!business) {
    console.error(`Byznys „${slug}" neexistuje.`)
    process.exit(1)
  }

  const scope = { accountId: business.account_id, businessId: business.id, slug, today: pragueToday() }
  const queries = removeOnly ? demoCleanupQueries(scope) : demoSeedQueries(scope)
  const what = removeOnly ? 'smazat ukázková data' : 'smazat starou ukázku a vložit novou'

  if (!confirmed) {
    console.log(`Byznys: ${business.name} (${slug})`)
    console.log(`Chystám se ${what} (${queries.length} příkazů v jedné transakci).`)
    console.log('Nic se nestalo. Spusťte znovu s --ano.')
    return
  }

  const app = neon(process.env.DATABASE_URL_WS)
  await app.transaction([
    app.query("SELECT set_config('app.account_id', $1, true)", [scope.accountId]),
    ...queries.map((x) => app.query(x.text, x.params)),
  ])
  console.log(`Hotovo: ${business.name} (${slug}) — ${what}.`)
  if (!removeOnly) console.log(`Otevřete /w/${slug}. Smazání: node scripts/ws-seed.mjs ${slug} --smazat --ano`)
}

main().catch((e) => {
  console.error('Seed selhal:', e instanceof Error ? e.message : e)
  process.exit(1)
})
