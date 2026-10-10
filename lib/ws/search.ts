import 'server-only'
import { q, wsDb } from './db'
import type { WsBusiness, WsContext } from './context'

// Hledání pro ⌘K: zákazníci (celý účet), poptávky a faktury (byznys).
// Text hledání jde do ILIKE jako parametr; %, _ a \ se escapují, aby
// „100%" nehledalo všechno.

export type SearchHit =
  | { kind: 'zakaznik'; id: string; title: string; subtitle: string | null }
  | { kind: 'poptavka'; id: string; title: string; subtitle: string | null }
  | { kind: 'faktura'; id: string; title: string; subtitle: string | null }

export const SEARCH_MAX_LENGTH = 80
const LIMIT = 6

export const likePattern = (text: string): string => `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`

export async function searchWorkspace(
  ctx: WsContext,
  business: Pick<WsBusiness, 'id'>,
  rawQuery: string,
): Promise<SearchHit[]> {
  const text = rawQuery.trim().slice(0, SEARCH_MAX_LENGTH)
  if (text.length < 2) return []
  const pattern = likePattern(text)
  // Telefon se hledá i bez mezer („777 123" najde +420777123…).
  const digits = text.replace(/\D/g, '')
  const phonePattern = digits.length >= 3 ? likePattern(digits) : null
  const accountId = ctx.accountId

  const [customers, requests, invoices] = await wsDb(ctx).batch([
    q`
      SELECT id, name, phone, email FROM ws.customers
      WHERE account_id = ${accountId}
        AND (name ILIKE ${pattern} OR email ILIKE ${pattern} OR (${phonePattern}::text IS NOT NULL AND phone LIKE ${phonePattern}))
      ORDER BY name LIMIT ${LIMIT}
    `,
    q`
      SELECT r.id, r.status, r.created_at, COALESCE(c.name, NULLIF(r.contact->>'name', ''), 'Bez jména') AS name
      FROM ws.requests r
      LEFT JOIN ws.customers c ON c.account_id = r.account_id AND c.id = r.customer_id
      WHERE r.account_id = ${accountId} AND r.business_id = ${business.id} AND NOT r.is_test
        AND (c.name ILIKE ${pattern} OR r.contact->>'name' ILIKE ${pattern} OR r.message ILIKE ${pattern})
      ORDER BY r.created_at DESC LIMIT ${LIMIT}
    `,
    q`
      SELECT id, number, amount, currency, counterparty->>'name' AS name FROM ws.invoices
      WHERE account_id = ${accountId} AND business_id = ${business.id}
        AND (number ILIKE ${pattern} OR counterparty->>'name' ILIKE ${pattern})
      ORDER BY issued_on DESC NULLS LAST, created_at DESC LIMIT ${LIMIT}
    `,
  ])

  type Row = Record<string, unknown>
  const s = (x: unknown) => (x === null || x === undefined ? null : String(x))
  return [
    ...(customers as Row[]).map((r): SearchHit => ({
      kind: 'zakaznik',
      id: String(r.id),
      title: String(r.name),
      subtitle: s(r.phone) ?? s(r.email),
    })),
    ...(requests as Row[]).map((r): SearchHit => ({
      kind: 'poptavka',
      id: String(r.id),
      title: String(r.name),
      subtitle: r.status === 'new' ? 'Nová poptávka' : 'Vyřízená poptávka',
    })),
    ...(invoices as Row[]).map((r): SearchHit => ({
      kind: 'faktura',
      id: String(r.id),
      title: s(r.number) ? `Faktura ${s(r.number)}` : 'Faktura bez čísla',
      subtitle: s(r.name),
    })),
  ]
}
