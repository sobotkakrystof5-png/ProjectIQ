import 'server-only'
import { adminDb } from '@/lib/admin/db'
import { ensureContact, findContact } from '@/lib/admin/contacts'
import { isValidIco, lookupIco } from '@/lib/ares'
import { normalizeEmail, normalizePhone } from '@/lib/contacts/normalize'
import { safeHttpUrl, stripControlChars } from '@/lib/security/html'
import { likeContains } from '@/lib/security/sql'
import { startResearch, type StartOutcome } from './research'

/**
 * Nová nabídka pro firmu (R-160): Kryštof zadá web, IČO nebo název, ZakazIQ
 * firmu najde mezi kontakty, nebo ji založí, a pustí rozbor. Po rozboru se
 * návrh nabídky připraví sám (`createProposalAfterResearch`).
 *
 * Kontakt se hledá podle e-mailu a telefonu (`findContact`), pak podle IČO
 * a nakonec podle webu firmy, se kterou mluvil robot (Growth OS má web
 * u firmy a kontakt k ní). Až pak vzniká nový kontakt.
 */

export type FirmInput = { web?: string; ico?: string; name?: string; email?: string; phone?: string }

export type FirmFields = { web: string | null; ico: string | null; name: string | null; email: string | null; phone: string | null }

const clean = (v: string | undefined, max: number): string | null => {
  if (typeof v !== 'string') return null
  const t = stripControlChars(v).replace(/\s+/g, ' ').trim().slice(0, max)
  return t === '' ? null : t
}

/** Web jak ho člověk napíše („firma.cz", „www.firma.cz/") → https adresa, jinak `null`. */
export function normalizeWeb(raw: string | undefined): string | null {
  const t = clean(raw, 300)
  if (t === null) return null
  const withScheme = /^https?:\/\//i.test(t) ? t : `https://${t}`
  const url = safeHttpUrl(withScheme)
  if (url === null) return null
  const host = new URL(url).hostname
  return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host) ? url : null
}

/** Host bez „www." pro porovnání webů. */
export function webHost(url: string): string {
  return new URL(url).hostname.toLowerCase().replace(/^www\./, '')
}

/** Kontrola formuláře. Vrací vyčištěná pole, nebo první chybu česky. */
export function parseFirmInput(input: FirmInput): { ok: true; fields: FirmFields } | { ok: false; error: string } {
  const webRaw = clean(input.web, 300)
  const icoRaw = clean(input.ico, 20)
  const name = clean(input.name, 200)
  const emailRaw = clean(input.email, 254)
  const phoneRaw = clean(input.phone, 40)
  if (!webRaw && !icoRaw && !name) return { ok: false, error: 'Zadejte web, IČO nebo název firmy.' }

  const web = normalizeWeb(webRaw ?? undefined)
  if (webRaw && !web) return { ok: false, error: 'Web nemá správný tvar. Napište třeba firma.cz.' }
  const ico = icoRaw ? icoRaw.replace(/\s/g, '') : null
  if (ico && !isValidIco(ico)) return { ok: false, error: 'IČO nemá správný tvar. Má osm číslic, zkontrolujte ho prosím.' }
  const email = emailRaw ? normalizeEmail(emailRaw) : null
  if (emailRaw && !email) return { ok: false, error: 'E-mail nemá správný tvar.' }
  const phone = phoneRaw ? normalizePhone(phoneRaw) : null
  if (phoneRaw && !phone) return { ok: false, error: 'Telefonu nerozumím. Napište ho třeba jako 604 123 456.' }
  return { ok: true, fields: { web, ico, name, email, phone } }
}

async function contactByIco(ico: string): Promise<string | null> {
  const rows = await adminDb<{ id: string }>`
    SELECT coalesce(merged_into, id)::text AS id FROM contacts WHERE ico = ${ico} ORDER BY created_at LIMIT 1`
  return rows[0]?.id ?? null
}

async function contactByRobotWeb(web: string): Promise<string | null> {
  const host = webHost(web)
  const rows = await adminDb<{ id: string; website: string }>`
    SELECT coalesce(c.merged_into, c.id)::text AS id, o.website
      FROM outreach_leads o JOIN contacts c ON c.id = o.contact_id
     WHERE o.website IS NOT NULL AND o.website ILIKE ${likeContains(host)}
     ORDER BY o.source_updated_at DESC LIMIT 5`
  const hit = rows.find((r) => {
    const url = safeHttpUrl(r.website)
    return url !== null && webHost(url) === host
  })
  return hit?.id ?? null
}

export type FirmOutcome =
  | { ok: true; contactId: string; created: boolean; research: StartOutcome }
  | { ok: false; error: string }

/** Najde nebo založí kontakt a spustí rozbor. */
export async function startOfferForFirm(input: FirmInput): Promise<FirmOutcome> {
  const parsed = parseFirmInput(input)
  if (!parsed.ok) return parsed
  const f = parsed.fields

  // Bez názvu ho zkusí dát rejstřík, jinak web. Nedostupný ARES nic neblokuje.
  let name = f.name
  if (!name && f.ico) {
    const ares = await lookupIco(f.ico).catch(() => null)
    if (ares?.status === 'ok') name = ares.subject.name
    else if (ares?.status === 'not_found' && !f.web) return { ok: false, error: 'Firmu s tímhle IČO rejstřík nezná. Zkontrolujte ho prosím.' }
  }
  if (!name && f.web) name = webHost(f.web)
  if (!name) name = `Firma IČO ${f.ico}`

  let contactId =
    (await findContact(f.phone, f.email)) ??
    (f.ico ? await contactByIco(f.ico) : null) ??
    (f.web ? await contactByRobotWeb(f.web) : null)
  let created = false
  if (contactId === null) {
    contactId = await ensureContact({ name, company: name, email: f.email, phone: f.phone, source: 'nabidka' })
    created = contactId !== null
  }
  if (contactId === null) return { ok: false, error: 'Kontakt se nepodařilo založit. Zkuste to prosím znovu.' }

  // IČO a chybějící údaje se doplní jen na prázdné místo, zadaný údaj se nepřepisuje.
  if (f.ico) {
    await adminDb`UPDATE contacts SET ico = ${f.ico} WHERE id = ${contactId} AND (ico IS NULL OR ico = '')`
  }

  const research = await startResearch({ contactId, web: f.web })
  return { ok: true, contactId, created, research }
}
