import 'server-only'
import { adminDb } from './db'

export { BASE_CURRENCY, toForeignTotals, type ForeignTotal } from '@/lib/money-currency'
import { BASE_CURRENCY } from '@/lib/money-currency'

/**
 * Měna v ledgeru (AD13, migrace 109).
 *
 * `finance_transactions` dostala sloupec `currency` až v 109. Migrace pouští
 * Kryštof a může to být až po nasazení větve — stejná situace jako u 105
 * (AD10) a 107 (AD12), takže se na sloupec nesmí sahat naslepo.
 *
 * Zjišťuje se to **za chodu a zadarmo**: dotaz se pošle tak, jak má vypadat
 * po migraci, a teprve když databáze odpoví „takový sloupec neznám" (42703),
 * zopakuje se bez měny a admin počítá přesně jako dřív. V normálním stavu
 * (migrace doběhla) to nestojí ani jedno kolo navíc — a to je důležité,
 * protože tohle čte i Dnes, první obrazovka adminu. Výsledek se drží
 * v paměti procesu.
 */

let ready: boolean | null = null

/** Jen pro testy — po doběhnutí migrace v testovací DB se zjištění musí zahodit. */
export function resetLedgerCurrencyForTests(): void {
  ready = null
}

/** Co se o měně ví teď, bez dotazu do databáze. `null` = zatím nic. */
export function ledgerCurrencyState(): boolean | null {
  return ready
}

/**
 * Kousky SQL, které se liší podle toho, jestli migrace 109 doběhla.
 * Do textu dotazu jde jen tohle, nikdy nic od uživatele.
 */
export type LedgerSql = {
  /** Má databáze sloupec `currency`? */
  has: boolean
  /** Výraz pro měnu řádku — sloupec, nebo konstanta před migrací. */
  currency(alias?: string): string
  /** Podmínka „jen koruny". Před migrací `TRUE`: tam jsou všechny řádky brané jako korunové. */
  czkOnly(alias?: string): string
}

function sqlFor(has: boolean): LedgerSql {
  const currency = (alias?: string) =>
    has ? (alias ? `${alias}.currency` : 'currency') : `'${BASE_CURRENCY}'::text`
  return {
    has,
    currency,
    czkOnly: (alias?: string) => (has ? `${currency(alias)} = '${BASE_CURRENCY}'` : 'TRUE'),
  }
}

/** Pozná „sloupec currency neexistuje" a nic jiného. */
export function isMissingLedgerCurrency(err: unknown): boolean {
  const code = (err as { code?: string })?.code
  const message = err instanceof Error ? err.message : String(err)
  const aboutCurrency = /currency/i.test(message) && /does not exist|neexistuje/i.test(message)
  return (code === '42703' && aboutCurrency) || aboutCurrency
}

/**
 * Stav zjištěný dotazem — pro **zápisy**.
 *
 * U čtení se dá neúspěšný dotaz prostě zopakovat (`withLedger`), u zápisu ne:
 * opakování by se spoléhalo na to, že dávka je transakce, a to platí jen
 * v produkci. Zápis proto raději zaplatí jedno kolo navíc — jednou za život
 * procesu, a jen když se zapisuje dřív, než se poprvé čtlo.
 */
export async function ledgerSql(): Promise<LedgerSql> {
  if (ready !== null) return sqlFor(ready)
  const [rows] = await adminDb.batch([
    {
      text: `
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'finance_transactions' AND column_name = 'currency'
        LIMIT 1
      `,
      params: [],
    },
  ])
  ready = rows.length > 0
  return sqlFor(ready)
}

/**
 * Pustí **čtecí** dotazy s měnou; když sloupec ještě není, zopakuje je bez ní.
 * Čtení se opakovat smí, takže to v obvyklém stavu nestojí ani jedno kolo navíc.
 */
export async function withLedger<T>(run: (L: LedgerSql) => Promise<T>): Promise<T> {
  if (ready !== null) return run(sqlFor(ready))
  try {
    const out = await run(sqlFor(true))
    ready = true
    return out
  } catch (err) {
    if (!isMissingLedgerCurrency(err)) throw err
    ready = false
    return run(sqlFor(false))
  }
}
