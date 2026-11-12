import 'server-only'
import { z } from 'zod'

/**
 * Odběratel podle IČO z ARES (AD12, R-086).
 *
 * Jediná nová vnější závislost celé modernizace adminu. Pravidla, která drží
 * `.claude/security/DECISIONS.md` #023:
 *
 * - volá **server**, nikdy prohlížeč → CSP se nemění,
 * - IČO se nejdřív ověří kontrolní číslicí (mod 11), takže překlep do sítě
 *   vůbec neodejde,
 * - timeout 3 s, `redirect: 'error'` (odpověď jen z ověřené adresy),
 * - odpověď projde Zodem a bere se z ní jen jméno, adresa a DIČ,
 * - výsledek se nikdy nevkládá jako HTML, jen jako hodnota do pole formuláře,
 * - odpověď se drží v paměti 24 h (jedno IČO se při vystavování ptá opakovaně),
 * - **selhání nikdy neblokuje fakturu** — volající jen nechá pole, jak jsou.
 *
 * Endpoint ověřen 2026-11-12 živým požadavkem (HTTP 200, `application/json`):
 * `GET https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/{ico}`.
 */

const ENDPOINT = 'https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/'
const TIMEOUT_MS = 3000
const TTL_MS = 24 * 60 * 60 * 1000
const CACHE_LIMIT = 200

export type AresSubject = {
  ico: string
  name: string
  address: string
  dic: string
}

export type AresLookup =
  | { status: 'ok'; subject: AresSubject }
  | { status: 'not_found' }
  | { status: 'invalid' }
  | { status: 'unavailable' }

/**
 * Kontrolní číslice IČO (mod 11). Osm číslic, váhy 8…2 na prvních sedmi.
 * Překlep v jedné číslici tím spadne tady, ne až na odpovědi z ARES.
 */
export function isValidIco(value: string): boolean {
  const digits = value.trim()
  if (!/^\d{8}$/.test(digits)) return false
  let sum = 0
  for (let i = 0; i < 7; i++) sum += Number(digits[i]) * (8 - i)
  const rest = sum % 11
  const check = rest === 0 ? 1 : rest === 1 ? 0 : 11 - rest
  return check === Number(digits[7])
}

/** Z odpovědi bereme jen tři údaje; zbytek registru nás nezajímá. */
const subjectSchema = z.object({
  ico: z.string().max(20).optional(),
  obchodniJmeno: z.string().max(400).optional(),
  dic: z.string().max(20).optional(),
  sidlo: z.object({ textovaAdresa: z.string().max(400).optional() }).optional(),
})

const cache = new Map<string, { at: number; value: AresLookup }>()

function remember(ico: string, value: AresLookup): AresLookup {
  // Nedostupnost se neukládá — příště to může vyjít.
  if (value.status === 'unavailable') return value
  if (cache.size >= CACHE_LIMIT) cache.clear()
  cache.set(ico, { at: Date.now(), value })
  return value
}

export async function lookupIco(rawIco: string): Promise<AresLookup> {
  const ico = rawIco.replace(/\s/g, '')
  if (!isValidIco(ico)) return { status: 'invalid' }

  const cached = cache.get(ico)
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value

  let response: Response
  try {
    response = await fetch(ENDPOINT + ico, {
      redirect: 'error',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: 'application/json' },
      cache: 'no-store',
    })
  } catch {
    // Timeout, DNS, přesměrování — pro formulář je to všechno totéž.
    return { status: 'unavailable' }
  }

  if (response.status === 404) return remember(ico, { status: 'not_found' })
  if (!response.ok) return { status: 'unavailable' }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    return { status: 'unavailable' }
  }

  const parsed = subjectSchema.safeParse(body)
  if (!parsed.success || !parsed.data.obchodniJmeno) return remember(ico, { status: 'not_found' })

  return remember(ico, {
    status: 'ok',
    subject: {
      ico,
      name: parsed.data.obchodniJmeno.trim(),
      address: parsed.data.sidlo?.textovaAdresa?.trim() ?? '',
      dic: parsed.data.dic?.trim() ?? '',
    },
  })
}

/** Jen pro testy — paměťová cache žije po dobu běhu procesu. */
export function clearAresCache(): void {
  cache.clear()
}
