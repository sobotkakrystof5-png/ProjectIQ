// Společné připojení pro skripty v scripts/ (migrace, role, seed). Stejná
// pravidla jako lib/pg.ts v aplikaci: node-postgres, SSL k Supabase,
// `sslmode` z URL se ignoruje, DATABASE_CA_CERT zapne ověření certifikátu.

const fs = require('fs')
const path = require('path')
const { Pool } = require('pg')

const ENV_FILE = path.join(__dirname, '..', '..', '.env.local')

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

const LOCAL_HOST_RE = /^(localhost|127\.0\.0\.1|\[::1\]|::1)$/

function poolConfig(connectionString) {
  const url = new URL(connectionString)
  for (const key of ['sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'uselibpqcompat', 'supa']) url.searchParams.delete(key)
  const ca = process.env.DATABASE_CA_CERT
  return {
    connectionString: url.toString(),
    ssl: LOCAL_HOST_RE.test(url.hostname)
      ? false
      : ca
        ? { ca: ca.replace(/\\n/g, '\n'), rejectUnauthorized: true }
        : { rejectUnauthorized: false },
    max: 2,
    // Skript skončí, jakmile nic nedělá — bez čekání na idle timeout.
    allowExitOnIdle: true,
  }
}

/**
 * `const sql = connect(url)` → `await sql\`SELECT …\`` vrátí řádky,
 * `await sql.query(text, params)` totéž s textem, `sql.transaction([{ text, params }])`
 * víc dotazů v jedné transakci, `await sql.end()` zavře pool.
 */
function connect(connectionString) {
  if (!connectionString) throw new Error('Chybí connection string.')
  const pool = new Pool(poolConfig(connectionString))
  const query = async (text, params = []) => (await pool.query(text, params)).rows
  const tag = (strings, ...values) => {
    let text = strings[0]
    for (let i = 0; i < values.length; i++) text += `$${i + 1}${strings[i + 1]}`
    return query(text, values)
  }
  /** Víc dotazů `{ text, params }` v jedné transakci; selže-li jeden, neprovede se nic. */
  const transaction = async (queries) => {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const results = []
      for (const q of queries) results.push((await client.query(q.text, q.params ?? [])).rows)
      await client.query('COMMIT')
      return results
    } catch (e) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw e
    } finally {
      client.release()
    }
  }
  return Object.assign(tag, { query, transaction, end: () => pool.end() })
}

/**
 * Connection string pro jinou DB roli se stejným hostem. Supavisor chce
 * uživatele ve tvaru `role.<project_ref>` (postgres.abcd → ws_app.abcd),
 * přímé spojení a lokální Postgres jen `role`.
 */
function urlForRole(adminUrl, role, password) {
  const url = new URL(adminUrl)
  const user = decodeURIComponent(url.username)
  const dot = user.indexOf('.')
  url.username = dot === -1 ? role : `${role}${user.slice(dot)}`
  url.password = password
  return url.toString()
}

/** Role, která obchází RLS sama nebo přes členství (Supabase: postgres, service_role…). */
const BYPASS_CHECK_SQL = `
  SELECT current_user AS name, r.rolbypassrls AS bypass, r.rolsuper AS super,
    EXISTS (
      SELECT 1 FROM pg_roles g
      WHERE (g.rolbypassrls OR g.rolsuper) AND g.oid <> r.oid AND pg_has_role(r.oid, g.oid, 'MEMBER')
    ) AS inherits_bypass
  FROM pg_roles r WHERE r.rolname = current_user
`

/** Vlastník tabulek: DATABASE_URL, jinak POSTGRES_URL z integrace Supabase ↔ Vercel. */
const ownerDatabaseUrl = () => process.env.DATABASE_URL || process.env.POSTGRES_URL || undefined

module.exports = { loadEnvLocal, writeEnvValue, connect, urlForRole, ownerDatabaseUrl, BYPASS_CHECK_SQL }
