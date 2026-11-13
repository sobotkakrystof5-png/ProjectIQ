/**
 * Měny v ledgeru — čistá část (AD13).
 *
 * Samostatný soubor bez `server-only` proto, že typ i formátování potřebují
 * klientské komponenty, zatímco zjišťování stavu databáze (`lib/admin/ledger.ts`)
 * patří jen na server.
 *
 * Pravidlo: **měny se nesčítají** (R-048). Hlavní číslo je vždy v korunách,
 * cizí měna stojí vedle něj vlastním řádkem. Kurz nikde neukládáme, takže
 * jakýkoli součet přes měny by byl vymyšlené číslo.
 */

/** Měna, ve které se vedou daně a všechny hlavní součty. */
export const BASE_CURRENCY = 'CZK'

/** Součet za jednu cizí měnu — vedle hlavního čísla, nikdy v něm. */
export interface ForeignTotal {
  currency: string
  amount: number
  count: number
}

/** Řádky `GROUP BY currency` → cizí měny bez korun, seřazené podle objemu. */
export function toForeignTotals(
  rows: { currency?: unknown; amount?: unknown; count?: unknown }[],
): ForeignTotal[] {
  return rows
    .map((row) => ({
      currency: String(row.currency ?? BASE_CURRENCY),
      amount: Number(row.amount ?? 0),
      count: Number(row.count ?? 0),
    }))
    .filter((row) => row.currency !== BASE_CURRENCY && row.amount !== 0)
    .sort((a, b) => b.amount - a.amount)
}

/** „1 200 EUR" — částka v dané měně, bez přepočtu. */
export function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat('cs-CZ', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount)
}

/** „mimo součet: 1 200 EUR · 300 USD" — jeden řádek pod korunovým číslem. */
export function foreignLabel(totals: ForeignTotal[]): string | null {
  if (totals.length === 0) return null
  return totals.map((t) => formatMoney(t.amount, t.currency)).join(' · ')
}
