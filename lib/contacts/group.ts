/**
 * Seskupení rozkopírovaných kontaktů do jedné entity (AD09).
 *
 * Vstupem jsou řádky z osmi míst, kde dnes kontakt žije (`client_leads`,
 * `projects`, `consultation_slots`, `completed_projects`, `agent_leads`),
 * výstupem jeden kontakt na člověka, seznam sporných případů a seznam řádků,
 * které se přiřadit nedají.
 *
 * Pořadí pravidel je dané zadáním: **nejdřív telefon, pak e-mail.** Telefon je
 * silnější identita — e-mail bývá firemní (`info@`) a sdílí ho víc lidí.
 *
 * Co je sporné, se **nepřiřadí**: raději kontakt navíc, který člověk v UI
 * sloučí, než dva lidi slepení do jednoho řádku (zpětně se to pozná hůř).
 *
 * Soubor je čistý a bez importů s aliasem — čte ho i
 * `scripts/admin-contacts-backfill.mjs` pouštěný v Node bez překladu.
 */

import { nameKey, normalizeEmail, normalizePhone, trimOrNull } from './normalize.ts'

/** Tabulky, kde dnes kontakt leží jako text. */
export type SourceTable = 'client_leads' | 'projects' | 'consultation_slots' | 'completed_projects' | 'agent_leads'

export type SourceRow = {
  table: SourceTable
  id: string
  /** Jméno člověka, jak je v řádku napsané. */
  name: string | null
  company: string | null
  email: string | null
  phone: string | null
  /** Kdy se kontakt naposledy objevil (datum řádku). */
  seenAt: string | null
  /** Už přiřazený kontakt — takový řádek se znovu nepřiřazuje. */
  contactId?: string | null
}

export type GroupedContact = {
  /** Klíč shody: `tel:+420…` nebo `mail:x@y.cz`. */
  key: string
  displayName: string
  company: string | null
  email: string | null
  phone: string | null
  lastSeenAt: string | null
  rows: SourceRow[]
  /** Další zápisy jména, které se u kontaktu objevily (pro UI). */
  nameVariants: string[]
  /** E-maily, které se u telefonu objevily, ale neshodly se (do kontaktu nejdou). */
  emailVariants: string[]
}

export type ConflictKind = 'email-u-vic-telefonu' | 'vic-emailu-u-telefonu' | 'bez-udaju'

export type Conflict = {
  kind: ConflictKind
  /** Česky, jedna řádka do výpisu skriptu. */
  message: string
  rows: SourceRow[]
}

export type GroupResult = {
  contacts: GroupedContact[]
  conflicts: Conflict[]
  /** Řádky, které zůstanou bez `contact_id`. */
  unassigned: SourceRow[]
}

type Normalized = {
  row: SourceRow
  phone: string | null
  email: string | null
}

const label = (row: SourceRow): string => `${row.table}/${row.id.slice(0, 8)} ${trimOrNull(row.name) ?? trimOrNull(row.company) ?? '—'}`

/** Nejčastější hodnota; při stejném počtu vyhraje delší (víc informace). */
function pick(values: (string | null)[]): string | null {
  const counts = new Map<string, number>()
  for (const value of values) {
    const text = trimOrNull(value)
    if (text === null) continue
    counts.set(text, (counts.get(text) ?? 0) + 1)
  }
  let best: string | null = null
  let bestCount = 0
  for (const [text, count] of counts) {
    if (count > bestCount || (count === bestCount && best !== null && text.length > best.length)) {
      best = text
      bestCount = count
    }
  }
  return best
}

function latest(values: (string | null)[]): string | null {
  let best: string | null = null
  for (const value of values) {
    if (value === null || value === undefined) continue
    if (best === null || String(value) > best) best = String(value)
  }
  return best
}

function uniqueNames(rows: SourceRow[], displayName: string): string[] {
  const out: string[] = []
  const seen = new Set([nameKey(displayName)])
  for (const row of rows) {
    const name = trimOrNull(row.name)
    if (name === null) continue
    const key = nameKey(name)
    if (key === '' || seen.has(key)) continue
    seen.add(key)
    out.push(name)
  }
  return out
}

export function groupContacts(input: SourceRow[]): GroupResult {
  const rows: Normalized[] = input
    .filter((row) => row.contactId === null || row.contactId === undefined)
    .map((row) => ({ row, phone: normalizePhone(row.phone), email: normalizeEmail(row.email) }))

  // 1. E-mail, který visí u dvou různých telefonů, neidentifikuje člověka
  //    (typicky `info@firma.cz`). Takový e-mail se do kontaktu nedostane.
  const phonesByEmail = new Map<string, Set<string>>()
  for (const item of rows) {
    if (item.email === null || item.phone === null) continue
    const phones = phonesByEmail.get(item.email) ?? new Set<string>()
    phones.add(item.phone)
    phonesByEmail.set(item.email, phones)
  }
  const sharedEmails = new Set<string>()
  /** E-mail, který patří jedinému telefonu — je to tentýž člověk. */
  const emailToPhone = new Map<string, string>()
  for (const [email, phones] of phonesByEmail) {
    if (phones.size > 1) sharedEmails.add(email)
    else emailToPhone.set(email, [...phones][0])
  }

  // 2. Skupiny podle telefonu, pak podle e-mailu (telefon je silnější).
  const groups = new Map<string, Normalized[]>()
  const unassigned: SourceRow[] = []
  const conflicts: Conflict[] = []
  const noData: SourceRow[] = []

  for (const item of rows) {
    if (item.phone !== null) {
      const key = `tel:${item.phone}`
      groups.set(key, [...(groups.get(key) ?? []), item])
      continue
    }
    if (item.email !== null) {
      if (sharedEmails.has(item.email)) {
        unassigned.push(item.row)
        continue
      }
      // Řádek bez telefonu, ale s e-mailem, který jinde u telefonu je:
      // patří k tomu telefonu (dokončená zakázka bez čísla u leadu s číslem).
      const byPhone = emailToPhone.get(item.email)
      const key = byPhone !== undefined ? `tel:${byPhone}` : `mail:${item.email}`
      groups.set(key, [...(groups.get(key) ?? []), item])
      continue
    }
    noData.push(item.row)
    unassigned.push(item.row)
  }

  for (const email of sharedEmails) {
    const affected = rows.filter((item) => item.email === email).map((item) => item.row)
    conflicts.push({
      kind: 'email-u-vic-telefonu',
      message: `E-mail ${email} je u ${phonesByEmail.get(email)?.size ?? 0} různých telefonů — do kontaktu se nepřiřadí: ${affected.map(label).join(', ')}`,
      rows: affected,
    })
  }

  if (noData.length > 0) {
    conflicts.push({
      kind: 'bez-udaju',
      message: `${noData.length} řádků nemá telefon ani e-mail, kontakt z nich nevznikne: ${noData.slice(0, 5).map(label).join(', ')}${noData.length > 5 ? ' …' : ''}`,
      rows: noData,
    })
  }

  // 3. Z každé skupiny jeden kontakt.
  const contacts: GroupedContact[] = []
  for (const [key, items] of groups) {
    const groupRows = items.map((item) => item.row)
    const emails = [...new Set(items.map((item) => item.email).filter((email): email is string => email !== null && !sharedEmails.has(email)))]
    const phone = key.startsWith('tel:') ? key.slice(4) : null

    if (emails.length > 1) {
      conflicts.push({
        kind: 'vic-emailu-u-telefonu',
        message: `Telefon ${phone ?? '—'} má ${emails.length} různých e-mailů (${emails.join(', ')}) — kontakt zůstane bez e-mailu, doplňte ho ručně`,
        rows: groupRows,
      })
    }

    const displayName =
      pick(groupRows.map((row) => row.name)) ?? pick(groupRows.map((row) => row.company)) ?? phone ?? emails[0] ?? 'Neznámý kontakt'

    contacts.push({
      key,
      displayName,
      company: pick(groupRows.map((row) => row.company)),
      email: emails.length === 1 ? emails[0] : null,
      phone,
      lastSeenAt: latest(groupRows.map((row) => row.seenAt)),
      rows: groupRows,
      nameVariants: uniqueNames(groupRows, displayName),
      emailVariants: emails.length > 1 ? emails : [],
    })
  }

  contacts.sort((a, b) => (a.displayName < b.displayName ? -1 : a.displayName > b.displayName ? 1 : 0))
  return { contacts, conflicts, unassigned }
}
