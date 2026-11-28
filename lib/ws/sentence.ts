/**
 * Tečka za větou, která končí jménem: „firmy Novák s.r.o." nesmí dostat
 * druhou tečku. Když text končí tečkou, otazníkem, vykřičníkem nebo
 * třemi tečkami, vrátí se beze změny.
 */
export function withPeriod(text: string): string {
  const trimmed = text.trimEnd()
  return /[.!?…]$/.test(trimmed) ? trimmed : `${trimmed}.`
}
