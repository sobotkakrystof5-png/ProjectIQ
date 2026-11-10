import { Pool, type PoolConfig } from 'pg'

// Připojení k Postgresu v Supabase (AGENTS.md → Databáze). Jediné místo, kde
// vzniká spojení — lib/db.ts (admin), lib/ws/db.ts (ws_app), lib/ws/admin/db.ts
// a lib/portal/db.ts (portal_app) si odsud berou pool a transakce.
//
// Ovladač je node-postgres (`pg`): typy sloupců (date → Date, int8/numeric →
// string, json → objekt) i převod parametrů jsou stejné jako u dřívějšího
// @neondatabase/serverless, který z něj vychází. Dotazy v aplikaci se proto
// nemusely měnit.
//
// Na Vercelu se připojujte přes Supavisor v režimu transaction (port 6543).
// node-postgres posílá parametrizované dotazy jako nepojmenované prepared
// statements, což transaction pooling snese.

export type PgRow = Record<string, any>
export type PgQuery = { readonly text: string; readonly params: readonly unknown[] }

declare global {
  // Pooly přežijí HMR v dev serveru i opakovaná volání ve stejné funkci na Vercelu.
  var __zakaziqPgPools: Map<string, Pool> | undefined
}

const pools = (globalThis.__zakaziqPgPools ??= new Map<string, Pool>())

const LOCAL_HOST_RE = /^(localhost|127\.0\.0\.1|\[::1\]|::1)$/

/**
 * SSL k Supabase. `sslmode` z URL se ignoruje — node-postgres by ho četl
 * přísněji než libpq a spojení s řetězcem certifikátů Supabase by odmítl.
 * S `DATABASE_CA_CERT` (PEM z Supabase → Database Settings → SSL) se certifikát
 * ověřuje; bez něj je spojení šifrované, ale server se neověřuje.
 */
function sslFor(host: string): PoolConfig['ssl'] {
  if (LOCAL_HOST_RE.test(host)) return false
  const ca = process.env.DATABASE_CA_CERT
  return ca ? { ca: ca.replace(/\\n/g, '\n'), rejectUnauthorized: true } : { rejectUnauthorized: false }
}

function poolConfig(connectionString: string): PoolConfig {
  const url = new URL(connectionString)
  // `supa` přidává integrace Supabase ↔ Vercel do POSTGRES_URL, pro pg nic neznamená.
  for (const key of ['sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'uselibpqcompat', 'supa']) url.searchParams.delete(key)
  return {
    connectionString: url.toString(),
    ssl: sslFor(url.hostname),
    max: Number(process.env.PG_POOL_MAX) || 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  }
}

/**
 * Spojení vlastníka tabulek (admin, migrace): `DATABASE_URL`, jinak `POSTGRES_URL`,
 * který do Vercelu zapisuje integrace Supabase ↔ Vercel (pooler, port 6543).
 * Explicitní `DATABASE_URL` má přednost — do přepnutí ve Vercelu míří na Neon.
 */
export const ownerDatabaseUrl = (): string | undefined => process.env.DATABASE_URL || process.env.POSTGRES_URL || undefined

export function pgPool(connectionString: string): Pool {
  let pool = pools.get(connectionString)
  if (!pool) {
    pool = new Pool(poolConfig(connectionString))
    // Spojení, které spadne v klidu (restart pooleru), nesmí shodit proces.
    pool.on('error', (e) => console.error('[db] nečinné spojení spadlo', { error: e.message }))
    pools.set(connectionString, pool)
  }
  return pool
}

/** `SELECT … WHERE id = ${id}` → `{ text: '… WHERE id = $1', params: [id] }`. */
export function toPgQuery(strings: TemplateStringsArray, values: readonly unknown[]): PgQuery {
  let text = strings[0]
  for (let i = 0; i < values.length; i++) text += `$${i + 1}${strings[i + 1]}`
  return { text, params: values }
}

/** Víc dotazů v jedné transakci; selže-li jeden, neprovede se nic. Výsledky v pořadí dotazů. */
export async function pgTransaction(connectionString: string, queries: readonly PgQuery[]): Promise<PgRow[][]> {
  const client = await pgPool(connectionString).connect()
  let broken = false
  try {
    await client.query('BEGIN')
    const results: PgRow[][] = []
    for (const q of queries) results.push((await client.query(q.text, [...q.params])).rows)
    await client.query('COMMIT')
    return results
  } catch (e) {
    try {
      await client.query('ROLLBACK')
    } catch {
      broken = true
    }
    throw e
  } finally {
    // Spojení, na kterém nešel ani ROLLBACK, do poolu nevracíme.
    client.release(broken)
  }
}

export type Sql = {
  <T extends PgRow = PgRow>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]>
  /** Dotaz jako text s parametry `$1…$n`. */
  query<T extends PgRow = PgRow>(text: string, params?: readonly unknown[]): Promise<T[]>
}

/**
 * Tagged template nad poolem: `await sql\`SELECT …\`` vrátí pole řádků.
 * URL se čte až při prvním dotazu, takže import modulu bez env nic nerozbije.
 */
export function createSql(connectionString: () => string | undefined, missing: string): Sql {
  const pool = () => {
    const url = connectionString()
    if (!url) throw new Error(missing)
    return pgPool(url)
  }
  const query = async <T extends PgRow = PgRow>(text: string, params: readonly unknown[] = []) =>
    (await pool().query(text, [...params])).rows as T[]
  const tag = <T extends PgRow = PgRow>(strings: TemplateStringsArray, ...values: unknown[]) => {
    const q = toPgQuery(strings, values)
    return query<T>(q.text, q.params)
  }
  return Object.assign(tag, { query })
}
