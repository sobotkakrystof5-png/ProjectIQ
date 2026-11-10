#!/usr/bin/env node
// Založí DB roli ws_app pro ZakazIQ Workspace a nastaví jí práva (S06).
//
//   node scripts/ws-create-role.js            založí roli (pokud není) + práva + kontrola
//   node scripts/ws-create-role.js --rotate   nastaví nové heslo (např. po úniku)
//
// Pouští se po migracích 064+ s DATABASE_URL (vlastník tabulek) z .env.local.
//
// Proč skript a ne Supabase dashboard: role se musí založit bez BYPASSRLS a bez
// členství v rolích, které ho mají (postgres, service_role…), jinak by pro ni
// Row Level Security neplatila. Skript to na konci ověří.
//
// V Supabase se role připojuje přes Supavisor jako `ws_app.<project_ref>`
// (skript uživatele v connection stringu odvodí z DATABASE_URL).
//
// Heslo se nikdy nevypisuje: connection string se zapíše rovnou do
// .env.local jako DATABASE_URL_WS. Do Vercelu ho zkopírujte odtamtud.

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { BYPASS_CHECK_SQL, connect, loadEnvLocal, ownerDatabaseUrl, urlForRole, writeEnvValue } = require('./lib/db')

const GRANTS_FILE = path.join(__dirname, 'ws-grants.sql')

// Soubor s právy nemá $$ bloky, stačí dělit po střednících.
function grantStatements() {
  return fs
    .readFileSync(GRANTS_FILE, 'utf8')
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
}

// base64url = jen [A-Za-z0-9_-], bezpečné vložit do SQL literálu.
const newPassword = () => crypto.randomBytes(32).toString('base64url')

async function main() {
  loadEnvLocal()
  const ownerUrl = ownerDatabaseUrl()
  if (!ownerUrl) {
    console.error('Chybí DATABASE_URL nebo POSTGRES_URL (.env.local nebo prostředí).')
    process.exit(1)
  }
  const rotate = process.argv.includes('--rotate')
  const admin = connect(ownerUrl)

  const [state] = await admin`
    SELECT
      EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'ws') AS has_schema,
      EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ws_app') AS has_role
  `
  if (!state.has_schema) {
    console.error('Schéma ws neexistuje. Nejdřív pusťte migrace 064–075 (docs/workspace/SETUP.md).')
    process.exit(1)
  }

  let password = null
  if (!state.has_role) {
    password = newPassword()
    await admin.query(
      `CREATE ROLE ws_app LOGIN NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD '${password}'`,
    )
    console.log('✓ role ws_app založena')
  } else if (rotate || !process.env.DATABASE_URL_WS) {
    if (!rotate) {
      console.error('Role ws_app existuje, ale v .env.local chybí DATABASE_URL_WS. Spusťte s --rotate (nastaví nové heslo).')
      process.exit(1)
    }
    password = newPassword()
    await admin.query(`ALTER ROLE ws_app WITH LOGIN NOBYPASSRLS PASSWORD '${password}'`)
    console.log('✓ heslo role ws_app změněno')
  } else {
    console.log('· role ws_app už existuje, heslo beze změny')
  }

  for (const stmt of grantStatements()) await admin.query(stmt)
  console.log('✓ práva z scripts/ws-grants.sql nastavena')

  if (password) {
    const url = urlForRole(ownerUrl, 'ws_app', password)
    writeEnvValue('DATABASE_URL_WS', url)
    process.env.DATABASE_URL_WS = url
    console.log('✓ DATABASE_URL_WS zapsáno do .env.local (hodnota se nevypisuje) — nastavte ji i ve Vercelu')
  }

  // Kontrola: přihlásit se jako ws_app a ověřit, že RLS platí a public je zavřený.
  const app = connect(process.env.DATABASE_URL_WS)
  const [me] = await app.query(BYPASS_CHECK_SQL)
  const problems = []
  if (me.name !== 'ws_app') problems.push(`přihlášen jako ${me.name}, ne ws_app`)
  if (me.bypass || me.super || me.inherits_bypass) problems.push('role obchází RLS (BYPASSRLS / superuser / členství v roli, která ho má)')

  try {
    await app`SELECT 1 FROM public.projects LIMIT 1`
    problems.push('ws_app vidí do public.projects')
  } catch (e) {
    if (e.code !== '42501') problems.push(`nečekaná chyba při kontrole public: ${e.code ?? e.message}`)
  }

  const [{ n }] = await app`SELECT count(*)::int AS n FROM ws.accounts`
  if (n !== 0) problems.push('bez nastaveného účtu vidí řádky ws.accounts')

  if (problems.length) {
    console.error('✗ kontrola selhala:\n  - ' + problems.join('\n  - '))
    process.exit(1)
  }
  console.log('✓ kontrola: ws_app bez BYPASSRLS, do public nevidí, bez účtu nevidí nic')
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(`✗ ${e.message}${e.code ? ` (${e.code})` : ''}`)
  process.exit(1)
})
