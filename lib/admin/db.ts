import 'server-only'
import { neon } from '@neondatabase/serverless'

/**
 * Datová vrstva admin konzole (AD06). Tabulky adminu jsou ve schématu
 * `public`, bez RLS a bez `account_id` — připojuje se `DATABASE_URL`.
 *
 * Proti `lib/db.ts` umí jedinou věc navíc, a o tu tu jde: **dávku**. Neon
 * HTTP pošle celou transakci jedním požadavkem, takže pět dotazů stojí jedno
 * kolo po síti místo pěti. Obrazovky adminu dělaly 5–12 kol, většinu z nich
 * za sebou.
 *
 * `lib/db.ts` zůstává kvůli ~50 souborům, které ho používají. Nové a
 * přepisované **čtení** jde přes `adminDb`; zápisy se nepřepisují, dokud
 * k tomu není důvod.
 *
 * Tohle není `lib/ws/admin/db.ts` — ten je o tom, jak admin čte schéma `ws`
 * (data klientů Workspace, R-052). Tenhle soubor se schématu `ws` nedotkne.
 */

export type AdminRow = Record<string, unknown>
export type AdminQuery = { readonly text: string; readonly params: readonly unknown[] }

/** Parametrizovaný dotaz: q`SELECT … WHERE id = ${id}` → `… WHERE id = $1`. */
export function q(strings: TemplateStringsArray, ...values: unknown[]): AdminQuery {
  let text = strings[0]
  for (let i = 0; i < values.length; i++) text += `$${i + 1}${strings[i + 1]}`
  return { text, params: values }
}

/** Ovladač: jedno volání = jeden požadavek, výsledky v pořadí dotazů. */
export type AdminDriver = { transaction(queries: AdminQuery[]): Promise<AdminRow[][]> }

function neonDriver(): AdminDriver {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('Chybí DATABASE_URL — admin konzole bez databáze neběží.')
  // Neon HTTP jde přes fetch a Next by odpovědi uložil do data cache (i na
  // stránkách s force-dynamic) — admin by pak ukazoval stará data.
  const sql = neon(url, { fetchOptions: { cache: 'no-store' } })
  return {
    async transaction(queries) {
      // Jeden dotaz nepotřebuje transakci — je to stejně jeden požadavek.
      if (queries.length === 1) {
        const rows = await sql.query(queries[0].text, [...queries[0].params])
        return [rows as AdminRow[]]
      }
      const results = await sql.transaction(queries.map((x) => sql.query(x.text, [...x.params])))
      return results as AdminRow[][]
    },
  }
}

let driver: AdminDriver | null = null
const getDriver = (): AdminDriver => (driver ??= neonDriver())

/** Jen pro testy: podstrčí ovladač (PGlite nebo čítač kol). `null` vrátí Neon. */
export function setAdminDbForTests(next: AdminDriver | null): void {
  driver = next
}

export type AdminDb = {
  <T extends AdminRow = AdminRow>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]>
  /** Víc dotazů jedním požadavkem. Selže-li jeden, neprojde nic. */
  batch(queries: AdminQuery[]): Promise<AdminRow[][]>
}

const batch = (queries: AdminQuery[]): Promise<AdminRow[][]> =>
  queries.length === 0 ? Promise.resolve([]) : getDriver().transaction(queries)

export const adminDb: AdminDb = Object.assign(
  async <T extends AdminRow = AdminRow>(strings: TemplateStringsArray, ...values: unknown[]) =>
    (await batch([q(strings, ...values)]))[0] as T[],
  { batch },
)

/**
 * Dávka, která snese chybějící tabulku. Tabulky z pozdějších migrací
 * (`client_requests` z 092, `project_activity` z 093) nemusí na každé
 * databázi existovat a v transakci by jediný takový dotaz shodil i všechny
 * ostatní. Běžný případ je tedy jedno kolo; když transakce selže, zkusí se
 * dotazy jednotlivě a ten rozbitý vrátí prázdno.
 */
export async function batchTolerant(queries: AdminQuery[]): Promise<AdminRow[][]> {
  try {
    return await batch(queries)
  } catch {
    return Promise.all(
      queries.map((query) =>
        batch([query])
          .then((r) => r[0])
          .catch(() => [] as AdminRow[]),
      ),
    )
  }
}
