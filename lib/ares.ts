import 'server-only'
import { z } from 'zod'
import { isValidIco } from './ico'

/**
 * ARES — veřejný rejstřík ekonomických subjektů (AD12, R-086).
 *
 * Jediná nová vnější závislost celé modernizace adminu. Slouží k jedinému:
 * vyplnit odběratele na faktuře podle IČO, aby se jméno a adresa neopisovaly
 * ručně. **Selhání ARESu nikdy nesmí zabránit vystavení faktury** — volající
 * dostane `null` nebo chybovou hlášku a formulář jede dál s ručně zadanými údaji.
 *
 * Ověřený endpoint (2026-11-12, skutečným dotazem, ne odhadem):
 *   GET https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/{ico}
 *   200 → { ico, obchodniJmeno, dic?, sidlo: { textovaAdresa } }
 *   404 → { kod: "NENALEZENO", … }
 *
 * Bezpečnost (zápis v `.claude/security/DECISIONS.md` #023):
 * - volá **server**, ne prohlížeč → CSP se nemění,
 * - timeout 3 s, bez následování přesměrování, jen GET,
 * - odpověď prochází Zodem a do stránky jde jako text, nikdy jako HTML,
 * - IČO se ověří kontrolní číslicí ještě před voláním, takže se ven neposílá
 *   každý překlep,
 * - odpověď se drží 24 h v datové cache Nextu (týž dotaz = jedno volání denně).
 */

const ARES_URL = 'https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/'

/** Kontrola IČO je v `lib/ico.ts` — potřebuje ji i formulář v prohlížeči. */
export { isValidIco }

const aresSchema = z.object({
  ico: z.string().max(20).optional(),
  obchodniJmeno: z.string().max(400).optional(),
  dic: z.string().max(20).optional(),
  sidlo: z.object({ textovaAdresa: z.string().max(400).optional() }).optional(),
})

export type AresSubject = {
  ico: string
  /** Název firmy nebo jméno podnikatele tak, jak je v rejstříku. */
  name: string
  /** Jednořádková adresa sídla; prázdná, když ji rejstřík nemá. */
  address: string
  /** DIČ, pokud je subjekt plátce DPH; jinak prázdné. */
  dic: string
}

export type AresLookup =
  | { ok: true; subject: AresSubject }
  | { ok: false; message: string }

/** Jedna mezera mezi slovy a žádné řídicí znaky — do formuláře i na doklad. */
function clean(value: string | undefined, max: number): string {
  return (value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

export async function lookupIco(rawIco: string): Promise<AresLookup> {
  const ico = rawIco.replace(/\s/g, '')
  if (!isValidIco(ico)) return { ok: false, message: 'Tohle IČO neexistuje. Zkontrolujte číslice.' }

  let response: Response
  try {
    response = await fetch(ARES_URL + ico, {
      headers: { Accept: 'application/json' },
      redirect: 'manual',
      signal: AbortSignal.timeout(3000),
      next: { revalidate: 86400 },
    })
  } catch {
    return { ok: false, message: 'Rejstřík teď neodpovídá. Vyplňte údaje ručně.' }
  }

  if (response.status === 404) return { ok: false, message: 'Firmu s tímhle IČO rejstřík nezná.' }
  if (!response.ok) return { ok: false, message: 'Rejstřík teď neodpovídá. Vyplňte údaje ručně.' }

  let data: unknown
  try {
    data = await response.json()
  } catch {
    return { ok: false, message: 'Rejstřík poslal odpověď, které nerozumíme. Vyplňte údaje ručně.' }
  }

  const parsed = aresSchema.safeParse(data)
  if (!parsed.success) return { ok: false, message: 'Rejstřík poslal odpověď, které nerozumíme. Vyplňte údaje ručně.' }

  const name = clean(parsed.data.obchodniJmeno, 160)
  if (!name) return { ok: false, message: 'Firmu s tímhle IČO rejstřík nezná.' }

  return {
    ok: true,
    subject: {
      ico,
      name,
      address: clean(parsed.data.sidlo?.textovaAdresa, 400),
      dic: clean(parsed.data.dic, 20),
    },
  }
}
