/**
 * Stav faktury — **jeden výpočet pro celý admin** (AD13).
 *
 * Do AD13 se „po splatnosti" počítalo na čtyřech místech čtyřmi způsoby:
 * dvakrát v server action ve Financích, v klientském archivu a v evidenci,
 * a každé si navíc bralo „dnešek" jinak. Tři z nich přes
 * `new Date().toISOString()`, což je kalendářní datum v **UTC** — to je
 * po pražské půlnoci ještě včerejší (v zimě do 1:00, v létě do 2:00).
 * Faktura, která se právě stala nesplacenou po termínu, se tak na hodinu
 * zatajila. Dva ze čtyř výpočtů navíc neuměly storno (AD12) a vymáhaly
 * doklad, který nikdo neplatí.
 *
 * Soubor je čistý (žádná databáze, žádný React), aby ho mohl použít server
 * i klientská komponenta. Dnešek se **vždy** předává zvenku a počítá ho
 * server (`getPragueTodayISO`) — prohlížeč v jiné zóně by odpočty posunul.
 *
 * Podmínky pro SQL jsou tady taky, aby databáze a TypeScript nikdy
 * neodpovídaly na stejnou otázku jinak.
 */

export interface InvoiceStatusFacts {
  /** Datum zaplacení, `null` = pohledávka. */
  paid_on: string | null
  /** Datum splatnosti, `null` = bez splatnosti (nikdy není po splatnosti). */
  due_on: string | null
  /** Storno (AD12): doklad zůstává v evidenci kvůli řadě, ale nevymáhá se. */
  cancelled_at?: string | null
}

export type InvoiceState = 'cancelled' | 'paid' | 'overdue' | 'open'

/** Stornováno → zaplaceno → po splatnosti → pohledávka. V tomhle pořadí. */
export function invoiceState(invoice: InvoiceStatusFacts, todayIso: string): InvoiceState {
  if (invoice.cancelled_at) return 'cancelled'
  if (invoice.paid_on) return 'paid'
  if (invoice.due_on !== null && invoice.due_on < todayIso) return 'overdue'
  return 'open'
}

/** Nezaplacená, nestornovaná a splatnost už byla. */
export function isInvoiceOverdue(invoice: InvoiceStatusFacts, todayIso: string): boolean {
  return invoiceState(invoice, todayIso) === 'overdue'
}

/** Pohledávka, kterou má smysl vymáhat — stornovaná se nepočítá. */
export function isInvoiceOutstanding(invoice: InvoiceStatusFacts, todayIso: string): boolean {
  const state = invoiceState(invoice, todayIso)
  return state === 'open' || state === 'overdue'
}

/** Kolik dní je po splatnosti. 0 = není. */
export function daysOverdue(invoice: InvoiceStatusFacts, todayIso: string): number {
  if (!isInvoiceOverdue(invoice, todayIso) || invoice.due_on === null) return 0
  const den = 24 * 60 * 60 * 1000
  const diff = Date.parse(`${todayIso}T00:00:00Z`) - Date.parse(`${invoice.due_on}T00:00:00Z`)
  return Math.max(0, Math.round(diff / den))
}

/**
 * Tytéž podmínky pro SQL. `alias` je alias tabulky `invoices` v dotazu.
 *
 * Dnešek bere databáze jako `current_date` — Neon i Postgres jedou v UTC,
 * takže se to od pražského data může v noci lišit o den. U součtů v evidenci
 * to nikomu nevadí (orientační číslo), u stavu konkrétního dokladu se
 * používá TypeScript s pražským dneškem.
 */
export const invoiceSql = {
  paid: (alias = 'i') => `${alias}.paid_on IS NOT NULL`,
  cancelled: (alias = 'i') => `${alias}.cancelled_at IS NOT NULL`,
  outstanding: (alias = 'i') => `${alias}.paid_on IS NULL AND ${alias}.cancelled_at IS NULL`,
  overdue: (alias = 'i') =>
    `${alias}.paid_on IS NULL AND ${alias}.cancelled_at IS NULL AND ${alias}.due_on IS NOT NULL AND ${alias}.due_on < current_date`,
} as const
