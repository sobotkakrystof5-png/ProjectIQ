// Formát peněz v klientském prostoru (KP13, KP16). Celé částky bez haléřů,
// jinak dvě desetinná místa; měna podle faktury. Bez importů, smí i do klienta.

const formatters = new Map<string, Intl.NumberFormat>()

export function formatMoney(amount: number, currency = 'CZK'): string {
  const whole = Number.isInteger(amount)
  const key = `${currency}:${whole}`
  let f = formatters.get(key)
  if (!f) {
    f = new Intl.NumberFormat('cs-CZ', {
      style: 'currency',
      currency,
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: 2,
    })
    formatters.set(key, f)
  }
  return f.format(amount)
}

/** 1 věc, 2 věci, 5 věcí. */
export function countLabel(n: number, forms: readonly [one: string, few: string, many: string]): string {
  const word = n === 1 ? forms[0] : n >= 2 && n <= 4 ? forms[1] : forms[2]
  return `${n} ${word}`
}
