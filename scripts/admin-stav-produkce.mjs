#!/usr/bin/env node
// Co z plánu modernizace adminu je na databázi doopravdy. **Jen čte.**
//
// Vzniklo 2026-11-13 při nasazení AD00–AD13: agent na produkční připojení
// nedosáhne, takže „migrace jsou venku" je jinak jen něčí slovo. Tenhle
// skript to převede na měření — a hlavně ukáže **daňová čísla**: kolik je
// příjem v korunách (to, co počítá nový kód) proti součtu všech měn
// dohromady (to, co počítal starý kód). Rozdíl je přesně ta chyba, kterou
// AD13 opravilo.
//
// Použití:
//   node scripts/admin-stav-produkce.mjs                       (testovací DB z .env.local)
//   node scripts/admin-stav-produkce.mjs --env .env.production.local
//
// Produkční připojení se stáhne:
//   vercel env pull .env.production.local --environment=production

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
const ano = (b) => (b ? 'ano' : 'NE')
const nadpis = (t) => console.log(`\n${t}\n${'─'.repeat(t.length)}`)

async function existujeSloupec(tabulka, sloupec) {
  const r = await sql.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2`,
    [tabulka, sloupec],
  )
  return r.length > 0
}
async function existujeTabulka(tabulka) {
  const r = await sql.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`,
    [tabulka],
  )
  return r.length > 0
}
async function existujeFunkce(jmeno) {
  const r = await sql.query(`SELECT 1 FROM pg_proc WHERE proname=$1`, [jmeno])
  return r.length > 0
}
async function existujeIndex(jmeno) {
  const r = await sql.query(`SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname=$1`, [jmeno])
  return r.length > 0
}

// ── 1. Evidence migrací ────────────────────────────────────────────────
nadpis('Evidence migrací (public.schema_migrations)')
if (await existujeTabulka('schema_migrations')) {
  const m = await sql.query(
    `SELECT filename, to_char(applied_at, 'YYYY-MM-DD HH24:MI') AS kdy
     FROM public.schema_migrations ORDER BY filename`,
  )
  console.log(m.length ? m.map((r) => `${r.kdy}  ${r.filename}`).join('\n') : '(tabulka je prázdná)')
} else {
  console.log('tabulka neexistuje — migrace se pouštěly jinak než běhounem scripts/apply-migration.js')
}

// ── 2. Co je v databázi vidět podle objektů ────────────────────────────
nadpis('Migrace podle skutečných objektů v databázi')
const kontroly = [
  ['100/101 (úklid modulů)', !(await existujeTabulka('school_subjects')) && !(await existujeTabulka('project_blocks')), 'tabulky smazané'],
  ['102 (jeden inbox poptávek)', await existujeSloupec('projects', 'lead_origin'), 'projects.lead_origin'],
  ['103 (indexy + pg_trgm)', (await sql.query(`SELECT 1 FROM pg_extension WHERE extname='pg_trgm'`)).length > 0, 'rozšíření pg_trgm'],
  ['104 (kontakty)', await existujeTabulka('contacts'), 'tabulka contacts'],
  ['105 (kalendář ↔ hovory)', await existujeFunkce('admin_lead_reschedule'), 'funkce admin_lead_reschedule'],
  ['106 (zakázka jediná pravda)', await existujeSloupec('projects', 'closed_at'), 'projects.closed_at'],
  ['107 (vystavování faktur)', await existujeFunkce('admin_invoice_issue'), 'funkce admin_invoice_issue'],
  ['108 (faktura se nemaže)', (await sql.query(`SELECT 1 FROM pg_trigger WHERE tgname='trg_admin_invoice_undeletable'`)).length > 0, 'trigger'],
  ['109 (měny a náklady)', await existujeSloupec('finance_transactions', 'currency'), 'finance_transactions.currency'],
]
for (const [jmeno, je, podle] of kontroly) console.log(`${ano(je).padEnd(4)} ${jmeno}  (podle: ${podle})`)

// ── 3. Podrobně AD13 ───────────────────────────────────────────────────
nadpis('AD13 — co všechno migrace 109 zakládá')
const ad13 = [
  ['finance_transactions.currency', await existujeSloupec('finance_transactions', 'currency')],
  ['finance_transactions.income_origin', await existujeSloupec('finance_transactions', 'income_origin')],
  ['invoices.payment_origin', await existujeSloupec('invoices', 'payment_origin')],
  ['invoices.payment_reviewed_at', await existujeSloupec('invoices', 'payment_reviewed_at')],
  ['costs.archived_at', await existujeSloupec('costs', 'archived_at')],
  ['projects.paid_on', await existujeSloupec('projects', 'paid_on')],
  ['funkce generate_recurring_costs', await existujeFunkce('generate_recurring_costs')],
  ['index finance_transactions_invoice_unique', await existujeIndex('finance_transactions_invoice_unique')],
  ['index finance_transactions_project_income_unique', await existujeIndex('finance_transactions_project_income_unique')],
]
for (const [jmeno, je] of ad13) console.log(`${ano(je).padEnd(4)} ${jmeno}`)
if (!(await existujeIndex('finance_transactions_project_income_unique'))) {
  console.log('\nPozor: index proti dvojímu příjmu ze zakázky chybí. Buď 109 neproběhla,')
  console.log('nebo se index nevytvořil kvůli duplicitám v datech (migrace to jen vypíše')
  console.log('jako WARNING). Najde je: node scripts/admin-prijmy-duplicity.mjs')
}

// ── 4. Daňová čísla: koruny proti součtu všech měn ─────────────────────
nadpis('Příjmy po letech — co jde do daní')
const maMenu = await existujeSloupec('finance_transactions', 'currency')
// Bez migrace 109 se měna odvodí z faktury, která příjem založila — přesně
// tak, jak to dělá `derivedCurrency` v lib/admin/ledger.ts.
const mena = maMenu
  ? 't.currency'
  : `COALESCE((SELECT f.currency FROM invoices f WHERE f.id = t.source_invoice_id), 'CZK')`
const radky = await sql.query(
  `SELECT date_part('year', t.date)::int AS rok,
          ${mena} AS mena,
          count(*)::int AS pocet,
          COALESCE(SUM(t.amount), 0)::float8 AS castka,
          COALESCE(SUM(t.amount) FILTER (WHERE t.declared), 0)::float8 AS priznano
   FROM finance_transactions t
   WHERE t.type = 'income' AND t.user_id IS NULL
   GROUP BY 1, 2 ORDER BY 1 DESC, 2`,
)
const roky = [...new Set(radky.map((r) => r.rok))]
for (const rok of roky) {
  const r = radky.filter((x) => x.rok === rok)
  const czk = r.find((x) => x.mena === 'CZK')
  const cizi = r.filter((x) => x.mena !== 'CZK')
  const vseSecteno = r.reduce((s, x) => s + x.castka, 0)
  console.log(`\n${rok}:`)
  console.log(`  CZK ....................... ${(czk?.castka ?? 0).toLocaleString('cs-CZ')} Kč (z toho přiznáno ${(czk?.priznano ?? 0).toLocaleString('cs-CZ')} Kč)  ← tohle počítá nový kód`)
  for (const c of cizi) console.log(`  ${c.mena} ....................... ${c.castka.toLocaleString('cs-CZ')} ${c.mena} (${c.pocet} dokladů) — mimo korunový součet`)
  if (cizi.length) {
    console.log(`  starý kód sčítal všechno dohromady: ${vseSecteno.toLocaleString('cs-CZ')} → o ${(vseSecteno - (czk?.castka ?? 0)).toLocaleString('cs-CZ')} víc, a to je ta chyba v daňovém základu`)
  } else {
    console.log('  cizí měna v tomhle roce není — nový i starý kód by dali stejné číslo')
  }
}

// ── 5. Doprovodné kroky, na které se zapomíná ──────────────────────────
nadpis('Doprovodné kroky')
if (await existujeTabulka('contacts')) {
  const [{ pocet }] = await sql.query(`SELECT count(*)::int AS pocet FROM contacts`)
  console.log(`kontaktů v tabulce contacts: ${pocet}${pocet === 0 ? '  ← backfill nikdy neproběhl (node scripts/admin-contacts-backfill.mjs)' : ''}`)
}
if (await existujeSloupec('projects', 'lead_pending')) {
  const [{ pocet }] = await sql.query(`SELECT count(*)::int AS pocet FROM projects WHERE lead_pending`)
  console.log(`nepotvrzených poptávek (lead_pending): ${pocet}  ← kontrola z hlavičky migrace 102`)
}
const dupl = await sql.query(
  `SELECT count(*)::int AS pocet FROM (
     SELECT t.source_project_id, t.deposit_transaction
     FROM finance_transactions t
     WHERE t.type='income' AND t.user_id IS NULL AND t.source_project_id IS NOT NULL
       AND t.source_invoice_id IS NULL AND t.category IS DISTINCT FROM 'dokončený projekt'
     GROUP BY 1,2 HAVING count(*) > 1
   ) x`,
)
console.log(`zakázek se dvěma příjmy téhož druhu: ${dupl[0].pocet}${dupl[0].pocet ? '  ← node scripts/admin-prijmy-duplicity.mjs' : ''}`)
console.log()
