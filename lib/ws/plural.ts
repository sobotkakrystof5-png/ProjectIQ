/**
 * České skloňování podle počtu: plural(2, ['poptávka', 'poptávky', 'poptávek']) → „2 poptávky".
 * 1 → první tvar, 2–4 → druhý, 0 a 5+ → třetí.
 */
export function plural(n: number, forms: readonly [string, string, string]): string {
  const abs = Math.abs(n)
  const form = abs === 1 ? forms[0] : abs >= 2 && abs <= 4 ? forms[1] : forms[2]
  return `${n} ${form}`
}
