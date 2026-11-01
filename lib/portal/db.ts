import { neon } from '@neondatabase/serverless'

// Jediný vstup do schématu portal (KP05, migrace 095).
//
// Připojuje se rolí portal_app z DATABASE_URL_PORTAL, pro kterou platí Row Level
// Security a která nemá žádná práva do schématu public. Nikdy ne přes
// DATABASE_URL (admin role RLS obchází; správa klientů z adminu jde přes lib/db).
// Každý dotaz běží v transakci, která nejdřív nastaví app.client_id.

export type PortalRow = Record<string, unknown>
export type PortalQuery = { readonly text: string; readonly params: readonly unknown[] }

export function pq(strings: TemplateStringsArray, ...values: unknown[]): PortalQuery {
  let text = strings[0]
  for (let i = 0; i < values.length; i++) text += `$${i + 1}${strings[i + 1]}`
  return { text, params: values }
}

export type PortalDriver = { transaction(queries: PortalQuery[]): Promise<PortalRow[][]> }

export class PortalConfigError extends Error {
  constructor() {
    super('Chybí DATABASE_URL_PORTAL — klientský prostor se k DB připojuje jen rolí portal_app (scripts/portal-create-role.js).')
  }
}

function neonDriver(): PortalDriver {
  const url = process.env.DATABASE_URL_PORTAL
  if (!url) throw new PortalConfigError()
  // Dotazy do DB se nikdy necachují (data cache Nextu by vracela stará data).
  const sql = neon(url, { fetchOptions: { cache: 'no-store' } })
  return {
    async transaction(queries) {
      return (await sql.transaction(queries.map((x) => sql.query(x.text, [...x.params])))) as PortalRow[][]
    },
  }
}

let driver: PortalDriver | null = null
const getDriver = (): PortalDriver => (driver ??= neonDriver())

/** Jen pro testy: podstrčí ovladač. `null` vrátí Neon. */
export function setPortalDriverForTests(next: PortalDriver | null): void {
  driver = next
}

export const isPortalConfigured = (): boolean => Boolean(process.env.DATABASE_URL_PORTAL)

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type PortalDb = {
  <T extends PortalRow = PortalRow>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]>
  batch(queries: PortalQuery[]): Promise<PortalRow[][]>
}

/**
 * Dotazy v kontextu klienta. `clientId` vždy z requireClient() (ověřený člen),
 * nikdy z formuláře ani URL.
 */
export function portalDb(scope: { clientId: string }): PortalDb {
  const { clientId } = scope
  if (!UUID_RE.test(clientId)) throw new Error('portalDb: clientId není UUID')
  const setClient = pq`SELECT set_config('app.client_id', ${clientId}, true)`
  const batch = async (queries: PortalQuery[]): Promise<PortalRow[][]> =>
    (await getDriver().transaction([setClient, ...queries])).slice(1)
  const tag = async <T extends PortalRow = PortalRow>(strings: TemplateStringsArray, ...values: unknown[]) =>
    (await batch([pq(strings, ...values)]))[0] as T[]
  return Object.assign(tag, { batch })
}

/** Dotaz bez klienta: jen funkce member_lookup a redeem_invite. Na tabulky nevidí nic. */
export async function portalSystem<T extends PortalRow = PortalRow>(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<T[]> {
  return (await getDriver().transaction([pq(strings, ...values)]))[0] as T[]
}
