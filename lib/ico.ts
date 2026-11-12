/**
 * Kontrolní číslice IČO (modulo 11). Osm číslic, váhy 8…2 na prvních sedm.
 *
 * Samostatný soubor proto, že tutéž kontrolu potřebuje formulář v prohlížeči
 * i server: `lib/ares.ts` je `server-only` (volá rejstřík) a do klientského
 * balíku nemá co dělat.
 */
export function isValidIco(value: string): boolean {
  const ico = value.trim()
  if (!/^\d{8}$/.test(ico)) return false
  let sum = 0
  for (let i = 0; i < 7; i++) sum += Number(ico[i]) * (8 - i)
  const rest = sum % 11
  const check = rest === 0 ? 1 : rest === 1 ? 0 : 11 - rest
  return check === Number(ico[7])
}
