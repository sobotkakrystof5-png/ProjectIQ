import { isIP } from 'node:net'

// IP klienta pro limity. Dřív ji čtyři místa v repu skládala každé po svém
// (`x-forwarded-for` bez kontroly tvaru, jinde `x-real-ip` první). Na Vercelu
// hodnotu hlaviček nastavuje platforma a klientovu vlastní zahazuje, takže
// první adresa je skutečná IP, jen se tu ještě ověří, že je to vůbec IP —
// jinak by si útočník do klíče limitu mohl poslat libovolný řetězec.

export const UNKNOWN_IP = 'unknown'

/** První platná IP z `x-vercel-forwarded-for`, `x-forwarded-for` nebo `x-real-ip`; jinak `unknown`. */
export function clientIpFromHeaders(headers: Headers): string {
  const candidates = [
    headers.get('x-vercel-forwarded-for'),
    headers.get('x-forwarded-for'),
    headers.get('x-real-ip'),
  ]
  for (const raw of candidates) {
    const first = raw?.split(',')[0]?.trim()
    if (first && isIP(first) !== 0) return first
  }
  return UNKNOWN_IP
}

/**
 * Klíč pro počítání požadavků. IPv4 beze změny; IPv6 se sráží na prefix /64,
 * protože jeden běžný přípojný bod dostane celou síť /64 (2^64 adres) a limit
 * na plné adrese by útočník obešel prostým střídáním koncovky.
 */
export function ipRateKey(ip: string): string {
  if (isIP(ip) !== 6) return ip
  const groups = expandIpv6(ip)
  return groups ? `${groups.slice(0, 4).join(':')}::/64` : ip
}

/** Osm čtveřic hexadecimálních číslic (malými písmeny) nebo `null`, když adresu nejde rozložit. */
function expandIpv6(ip: string): string[] | null {
  // Zóna (`fe80::1%eth0`) a vložená IPv4 (`::ffff:1.2.3.4`) nejsou ve veřejném provozu.
  const bare = ip.split('%')[0]!
  if (bare.includes('.')) return null
  const halves = bare.split('::')
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(':') : []
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  const missing = 8 - head.length - tail.length
  if (halves.length === 1 ? missing !== 0 : missing < 0) return null
  const all = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill('0'), ...tail]
  if (all.length !== 8) return null
  return all.map((g) => g.toLowerCase().padStart(4, '0'))
}
