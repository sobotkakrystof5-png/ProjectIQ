import 'server-only'
import { unstable_noStore as noStore } from 'next/cache'
import { ownerDatabaseUrl, pgTransaction } from '../../pg'
import { q, type WsDriver, type WsQuery, type WsRow } from '../db'

// Admin konzole nad schématem ws (S17, R-052). Připojení přes DATABASE_URL —
// vlastník tabulek, RLS nepodléhá a vidí všechny účty. Proto jen tady, jen
// z /dashboard/klienti a /dashboard/novinky a jen po requireAdmin().
//
// Zapisuje jen do: ws.product_news, ws.audit_log. Historická tabulka
// ws.account_admin_notes se kvůli ochraně soukromí už v konzoli nečte ani nepíše.
// Všechno, co mění data účtu klienta (založení účtu, klíče webu), jde přes
// lib/ws (role ws_app pod RLS) s accountId ověřeným tady.

function ownerDriver(): WsDriver {
  const url = ownerDatabaseUrl()
  if (!url) throw new Error('Chybí DATABASE_URL (nebo POSTGRES_URL) — admin čte ws rolí vlastníka tabulek.')
  return {
    async transaction(queries) {
      noStore()
      return pgTransaction(url, queries)
    },
  }
}

let driver: WsDriver | null = null
const getDriver = (): WsDriver => (driver ??= ownerDriver())

/** Jen pro testy: PGlite jako vlastník (bez SET ROLE). `null` vrátí Postgres z DATABASE_URL. */
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
