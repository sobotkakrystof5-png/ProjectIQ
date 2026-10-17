import 'server-only'
import { neon } from '@neondatabase/serverless'
import { q, type WsDriver, type WsQuery, type WsRow } from '../db'

// Admin konzole nad schématem ws (S17, R-052). Připojení přes DATABASE_URL —
// vlastník tabulek, RLS nepodléhá a vidí všechny účty. Proto jen tady, jen
// z /dashboard/klienti a /dashboard/novinky a jen po requireAdmin().
//
// Zapisuje jen do: ws.product_news, ws.account_admin_notes, ws.audit_log.
// Všechno, co mění data účtu klienta (založení účtu, klíče webu), jde přes
// lib/ws (role ws_app pod RLS) s accountId ověřeným tady.

function neonOwnerDriver(): WsDriver {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('Chybí DATABASE_URL — admin čte ws rolí vlastníka tabulek.')
  const sql = neon(url, { fetchOptions: { cache: 'no-store' } })
  return {
    async transaction(queries) {
      return (await sql.transaction(queries.map((x) => sql.query(x.text, [...x.params])))) as WsRow[][]
    },
  }
}

let driver: WsDriver | null = null
const getDriver = (): WsDriver => (driver ??= neonOwnerDriver())

/** Jen pro testy: PGlite jako vlastník (bez SET ROLE). `null` vrátí Neon. */
export function setAdminDriverForTests(next: WsDriver | null): void {
  driver = next
}

export type AdminDb = {
  <T extends WsRow = WsRow>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]>
  batch(queries: WsQuery[]): Promise<WsRow[][]>
}

const batch = (queries: WsQuery[]) => getDriver().transaction(queries)

export const adminDb: AdminDb = Object.assign(
  async <T extends WsRow = WsRow>(strings: TemplateStringsArray, ...values: unknown[]) =>
    (await batch([q(strings, ...values)]))[0] as T[],
  { batch },
)
