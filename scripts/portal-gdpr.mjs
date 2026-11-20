#!/usr/bin/env node
// Žádost člena klienta podle GDPR (KP10, R-131, migrace 127).
//
//   Export (čl. 15) — vypíše JSON na standardní výstup, nic nemění:
//     node scripts/portal-gdpr.mjs --email jana@firma.cz --export > ~/Desktop/export.json
//
//   Výmaz (čl. 17) — bez --ano jen vypíše, co by se smazalo:
//     node scripts/portal-gdpr.mjs --email jana@firma.cz --vymaz
//     node scripts/portal-gdpr.mjs --email jana@firma.cz --vymaz --ano
//     … --ponechat-zpravy   text zpráv zůstane firmě, zmizí jen jméno autora
//
//   Produkce: --env .env.production.local (vercel env pull … --environment=production)
//
// Výmaz smaže člena ve všech prostorech, kde je, a jeho účet v Supabase Auth
// (když není členem nikde jinde). Soubory příloh zmizí z úložiště při
// nejbližším ranním úklidu (cron client-retention). Export ukládejte mimo repo.

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
const has = (name) => args.includes(name)
const log = (...a) => console.error(...a) // výstup pro člověka jde na stderr, JSON exportu na stdout

function loadEnv(which) {
  const file = path.isAbsolute(which) ? which : path.join(ROOT, which)
  if (!fs.existsSync(file)) {
    log(`Soubor ${which} neexistuje.`)
    process.exit(1)
  }
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const email = (flag('--email') ?? '').trim().toLowerCase()
const mode = has('--export') ? 'export' : has('--vymaz') ? 'vymaz' : null
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !mode) {
  log('Použití: node scripts/portal-gdpr.mjs --email <e-mail> (--export | --vymaz [--ponechat-zpravy] [--ano]) [--env <soubor>]')
  process.exit(1)
}

loadEnv(flag('--env') || '.env.local')
if (!process.env.DATABASE_URL) {
  log('Chybí DATABASE_URL.')
  process.exit(1)
}
const sql = neon(process.env.DATABASE_URL)

const members = await sql.query(
  `SELECT m.id::text, m.clerk_user_id, c.name AS firma, m.removed_at
   FROM portal.members m JOIN portal.clients c ON c.id = m.client_id
   WHERE lower(m.email) = $1 ORDER BY m.created_at`,
  [email],
)
if (members.length === 0) {
  log(`Člen s e-mailem ${email} v klientském prostoru není. Zkontrolujte ještě Kontakty a zakázky v adminu.`)
  process.exit(0)
}

if (mode === 'export') {
  const out = []
  for (const m of members) {
    const [row] = await sql.query('SELECT public.portal_export_member($1) AS e', [m.id])
    out.push(row.e)
  }
  process.stdout.write(`${JSON.stringify({ email, prostory: out }, null, 2)}\n`)
  log(`Export hotový: ${members.length} ${members.length === 1 ? 'prostor' : 'prostory'}. Soubor předejte klientovi a smažte ho u sebe.`)
  process.exit(0)
}

// --- výmaz ---------------------------------------------------------------------

const keep = has('--ponechat-zpravy')
log(`Výmaz údajů ${email} (${keep ? 'text zpráv zůstane firmě' : 'včetně jeho zpráv a příloh'}):`)
for (const m of members) {
  const [row] = await sql.query('SELECT public.portal_export_member($1) AS e', [m.id])
  const e = row.e
  log(`  • ${m.firma}: zprávy ${e.zpravy.length}, požadavky ${e.pozadavky.length}, konzultace ${e.konzultace.length}, pozvánky ${e.pozvanky.length}${m.removed_at ? ' (člen už odebraný)' : ''}`)
}
if (!has('--ano')) {
  log('\nNic se nesmazalo. Spusťte znovu s --ano.')
  process.exit(0)
}

const authIds = new Set()
for (const m of members) {
  const [row] = await sql.query('SELECT public.portal_erase_member($1, $2) AS r', [m.id, keep])
  const r = row.r
  log(`  ✓ ${m.firma}: smazáno zpráv ${r.messages}, příloh ${r.attachments}, pozvánek ${r.invites}, konzultací upraveno ${r.consultations}`)
  if (r.auth_user_id && !r.auth_user_used_elsewhere) authIds.add(r.auth_user_id)
}

const url = (process.env.SUPABASE_URL ?? '').replace(/\/$/, '')
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
for (const id of authIds) {
  if (!url || !key) {
    log(`  ! Účet v Supabase (${id}) smažte ručně: Authentication → Users. Chybí SUPABASE_URL nebo SUPABASE_SERVICE_ROLE_KEY.`)
    continue
  }
  const res = await fetch(`${url}/auth/v1/admin/users/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { apikey: key, authorization: `Bearer ${key}` },
  })
  if (res.ok || res.status === 404) log(`  ✓ Účet v Supabase smazaný${res.status === 404 ? ' (už neexistoval)' : ''}.`)
  else log(`  ! Účet v Supabase se smazat nepodařilo (HTTP ${res.status}). Smažte ho ručně: Authentication → Users.`)
}

log(`
Ručně zbývá:
  - Google Kalendář: události jeho konzultací (název a popis mohou nést jméno).
  - Admin → Kontakty a zakázky: kontakt a e-mail v zakázce jsou údaje firmy, ne člena; smazat jen když jde o něj.
  - Vlastní e-mailová schránka (krystof@vizeon.cz): korespondence s ním.
  - Soubory příloh zmizí z úložiště při ranním úklidu (cron client-retention).
  - Zapsat vyřízení žádosti (datum, rozsah) do evidence, nikoli e-mail.`)
