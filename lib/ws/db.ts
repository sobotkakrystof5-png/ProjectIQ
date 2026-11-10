import { unstable_noStore as noStore } from 'next/cache'
import { pgTransaction } from '../pg'

// Jediný vstup do schématu ws (AGENTS.md B3, skill zakaziq-workspace-backend).
//
// Připojuje se rolí ws_app z DATABASE_URL_WS, pro kterou platí Row Level
// Security. Nikdy ne přes DATABASE_URL — admin role RLS obchází
// (scripts/ws-create-role.js).
//
// Každý dotaz běží v transakci, která nejdřív nastaví app.account_id, takže
// RLS pustí jen řádky toho účtu. Aplikační filtr account_id = ctx.accountId
// v SQL je přesto povinný — RLS je druhá pojistka, ne náhrada.

export type WsRow = Record<string, unknown>
export type WsQuery = { readonly text: string; readonly params: readonly unknown[] }

/** Parametrizovaný dotaz: q`SELECT … WHERE id = ${id}` → `… WHERE id = $1`. */
export function q(strings: TemplateStringsArray, ...values: unknown[]): WsQuery {
  let text = strings[0]
  for (let i = 0; i < values.length; i++) text += `$${i + 1}${strings[i + 1]}`
  return { text, params: values }
}

/** Ovladač DB: jedno volání = jedna transakce, výsledky v pořadí dotazů. */
export type WsDriver = { transaction(queries: WsQuery[]): Promise<WsRow[][]> }

// Transakce na jednom spojení z poolu (lib/pg.ts). Dotazy jdou za sebou,
// výsledek předchozího ale aplikace nečte — tvar zůstal z doby Neon HTTP.
function pgDriver(): WsDriver {
  const url = process.env.DATABASE_URL_WS
  if (!url) {
    throw new Error('Chybí DATABASE_URL_WS — Workspace se k DB připojuje jen rolí ws_app (docs/workspace/SETUP.md).')
  }
  return {
    async transaction(queries) {
      // Data účtů se nikdy necachují: stránka, která čte ws, se renderuje vždy
      // na požadavek (dřív to zařizoval fetch s cache: 'no-store').
      noStore()
      return pgTransaction(url, queries)
    },
  }
}

let driver: WsDriver | null = null
const getDriver = (): WsDriver => (driver ??= pgDriver())

/** Jen pro testy: podstrčí ovladač (PGlite). `null` vrátí Postgres z DATABASE_URL_WS. */
export function setWsDriverForTests(next: WsDriver | null): void {
  driver = next
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type WsDb = {
  <T extends WsRow = WsRow>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]>
  /** Víc dotazů v jedné transakci; selže-li jeden, neprovede se nic. */
  batch(queries: WsQuery[]): Promise<WsRow[][]>
}

/**
 * Dotazy v kontextu účtu. `accountId` vždy z requireWorkspace() nebo
 * z ověřeného zdroje (podepsaný webhook, klíč webu) — nikdy z formuláře ani URL.
 */
export function wsDb(scope: { accountId: string }): WsDb {
  const { accountId } = scope
  if (!UUID_RE.test(accountId)) throw new Error('wsDb: accountId není UUID')
  const setAccount = q`SELECT set_config('app.account_id', ${accountId}, true)`

  const batch = async (queries: WsQuery[]): Promise<WsRow[][]> =>
    (await getDriver().transaction([setAccount, ...queries])).slice(1)

  const tag = async <T extends WsRow = WsRow>(strings: TemplateStringsArray, ...values: unknown[]) =>
    (await batch([q(strings, ...values)]))[0] as T[]

  return Object.assign(tag, { batch })
}

/**
 * Dotaz bez účtu — jen SECURITY DEFINER funkce (ws.membership_for_user…)
 * a systémové tabulky bez RLS (stripe_events, webhook_events, rate_limits).
 * Na tabulky s daty účtů pod RLS nevidí nic.
 */
export async function wsSystem<T extends WsRow = WsRow>(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<T[]> {
  return (await getDriver().transaction([q(strings, ...values)]))[0] as T[]
}

/** Kód chyby Postgresu (pg i PGlite ho dávají do `code`). */
export function pgErrorCode(e: unknown): string | undefined {
  if (typeof e === 'object' && e !== null && 'code' in e && typeof e.code === 'string') return e.code
  return undefined
}

/** Název porušeného omezení (např. `businesses_slug_key`), pokud ho chyba nese. */
export function pgConstraint(e: unknown): string | undefined {
  if (typeof e === 'object' && e !== null && 'constraint' in e && typeof e.constraint === 'string') return e.constraint
  return undefined
}

/** Překryv termínů (EXCLUDE na ws.appointments). */
export const isOverlapError = (e: unknown): boolean => pgErrorCode(e) === '23P01'

/** Porušení unikátnosti (duplicitní zákazník, razítko, událost…). */
export const isUniqueViolation = (e: unknown): boolean => pgErrorCode(e) === '23505'
