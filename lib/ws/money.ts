// Částky ve Workspace. Měny se nikdy nesčítají dohromady (AGENTS.md → B3) — formátuje se vždy
// jedna částka v jedné měně.

export type WsCurrency = 'CZK' | 'EUR'

const formatters = new Map<string, Intl.NumberFormat>()

function formatter(currency: WsCurrency, fractionDigits: 0 | 2): Intl.NumberFormat {
  const key = `${currency}:${fractionDigits}`
  let f = formatters.get(key)
  if (!f) {
    f = new Intl.NumberFormat('cs-CZ', {
      style: 'currency',
      currency,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    })
    formatters.set(key, f)
  }
  return f
}

/**
 * „1 249 Kč", „249,50 Kč", „120 €". Desetinná místa jen tehdy, když nejsou nulová.
 * `minor: true` = částka je v haléřích / centech (tak se peníze ukládají v DB).
 */
export function formatMoney(amount: number, opts: { currency?: WsCurrency; minor?: boolean } = {}): string {
  const currency = opts.currency ?? 'CZK'
  const value = opts.minor ? amount / 100 : amount
  const whole = Math.round(Math.abs(value) * 100) % 100 === 0
  return formatter(currency, whole ? 0 : 2).format(value)
}

/**
 * Má částka nejvýš dvě desetinná místa? 19,99 * 100 je v plovoucí čárce
 * 1998,9999999999998, proto tolerance místo přesného porovnání.
 */
export function hasWholeMinor(amount: number): boolean {
  const minor = amount * 100
  return Number.isFinite(minor) && Math.abs(minor - Math.round(minor)) < 1e-6
}
