#!/usr/bin/env node
// Založí DB roli ws_app pro ZakazIQ Workspace a nastaví jí práva (S06).
//
//   node scripts/ws-create-role.js            založí roli (pokud není) + práva + kontrola
//   node scripts/ws-create-role.js --rotate   nastaví nové heslo (např. po úniku)
//
// Pouští se po migracích 064+ s DATABASE_URL (vlastník tabulek) z .env.local.
//
// Proč skript a ne Neon konzole: role založené v konzoli dostanou členství
// v neon_superuser, který má BYPASSRLS — Row Level Security by pro ně
// neplatila. Role založená přes SQL ho nemá. Skript to na konci ověří.
//
// Heslo se nikdy nevypisuje: connection string se zapíše rovnou do
// .env.local jako DATABASE_URL_WS. Do Vercelu ho zkopírujte odtamtud.

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { neon } = require('@neondatabase/serverless')

const ENV_FILE = path.join(__dirname, '..', '.env.local')
const GRANTS_FILE = path.join(__dirname, 'ws-grants.sql')

// .env.local se čte ručně — dotenv není v závislostech projektu.
function loadEnvLocal() {
  if (!fs.existsSync(ENV_FILE)) return
  for (const line of fs.readFileSync(ENV_FILE, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    if (process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  }
}

function writeEnvValue(name, value) {
  const raw = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf8') : ''
  const line = `${name}=${value}`
  const re = new RegExp(`^\\s*${name}\\s*=.*$`, 'm')
  const next = re.test(raw) ? raw.replace(re, line) : `${raw}${raw.endsWith('\n') || raw === '' ? '' : '\n'}${line}\n`
  fs.writeFileSync(ENV_FILE, next, { mode: 0o600 })
}

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
  if (!process.env.DATABASE_URL) {
    console.error('Chybí DATABASE_URL (.env.local nebo prostředí).')
    process.exit(1)
  }
  const rotate = process.argv.includes('--rotate')
  const admin = neon(process.env.DATABASE_URL)

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
    const url = new URL(process.env.DATABASE_URL)
    url.username = 'ws_app'
    url.password = password
    writeEnvValue('DATABASE_URL_WS', url.toString())
    process.env.DATABASE_URL_WS = url.toString()
    console.log('✓ DATABASE_URL_WS zapsáno do .env.local (hodnota se nevypisuje) — nastavte ji i ve Vercelu')
  }

  // Kontrola: přihlásit se jako ws_app a ověřit, že RLS platí a public je zavřený.
  const app = neon(process.env.DATABASE_URL_WS)
  const [me] = await app`
    SELECT current_user AS name, r.rolbypassrls AS bypass, r.rolsuper AS super,
      EXISTS (
        SELECT 1 FROM pg_auth_members m JOIN pg_roles g ON g.oid = m.roleid
        WHERE m.member = r.oid AND g.rolname = 'neon_superuser'
      ) AS neon_superuser
    FROM pg_roles r WHERE r.rolname = current_user
  `
  const problems = []
  if (me.name !== 'ws_app') problems.push(`přihlášen jako ${me.name}, ne ws_app`)
  if (me.bypass || me.super || me.neon_superuser) problems.push('role obchází RLS (BYPASSRLS / superuser / neon_superuser)')

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

main().catch((e) => {
  console.error(`✗ ${e.message}${e.code ? ` (${e.code})` : ''}`)
  process.exit(1)
})
