import { adminDb } from '@/lib/admin/db'
import { findContact, suggestContacts, type ContactSuggestion } from '@/lib/admin/contacts'
import { nameKey, normalizeEmail, normalizePhone } from '@/lib/contacts/normalize'
import type { MeetingParticipant } from '@/types/meeting-notes'
import type { ContactSource } from './store'

/**
 * O koho na schůzce jde (R-144).
 *
 * Nejdřív **jisté shody bez AI**: e-mail účastníka z Wispr Flow, nebo událost
 * v kalendáři ve stejný čas, která má kontakt (schůzka přes Google Meet,
 * termín z Hovorů nebo zakázky). Ty se přiřadí rovnou. Teprve když nic takového
 * není, dostane AI seznam kandidátů a vybere z nich — a její návrh potvrzuje
 * Kryštof jedním kliknutím, protože přepis je text, který mluvil klient.
 */

/** Kryštof sám. Wispr Flow ho v přepisu značí příjmením, jménem nebo „Speaker N". */
const SELF_NAME = /sobotk|kry[sš]tof/i

export function selfEmails(): string[] {
  const list = [process.env.ADMIN_EMAIL, process.env.VIZEON_ADMIN_EMAIL, 'krystof@vizeon.cz', 'info@vizeon.cz']
  return [...new Set(list.map((e) => normalizeEmail(e ?? null)).filter((e): e is string => e !== null))]
}

export function isSelf(p: MeetingParticipant, own: string[] = selfEmails()): boolean {
  if (p.self) return true
  if (p.emails.some((e) => own.includes(e))) return true
  return p.name !== null && SELF_NAME.test(p.name)
}

export function otherParticipants(participants: MeetingParticipant[], own: string[] = selfEmails()): MeetingParticipant[] {
  return participants.filter((p) => !isSelf(p, own))
}

export type DeterministicMatch = { contactId: string; source: ContactSource; calendarEventId: string | null }

export type CalendarHit = { eventId: string; title: string; contactId: string | null }

/** Události v kalendáři, které se se schůzkou časově překrývají (±20 minut), nejbližší první. */
export async function calendarHits(startedAt: string | null, endedAt: string | null): Promise<CalendarHit[]> {
  if (!startedAt) return []
  const start = new Date(startedAt)
  const end = endedAt ? new Date(endedAt) : new Date(start.getTime() + 30 * 60_000)
  const from = new Date(start.getTime() - 20 * 60_000).toISOString()
  const to = new Date(end.getTime() + 20 * 60_000).toISOString()
  const [rows] = await adminDb.batch([
    {
      // `invite_to` je až od migrace 115 — přes to_jsonb, ať dotaz nespadne bez ní.
      text: `SELECT e.id::text AS event_id, e.title,
                    coalesce(
                      (SELECT coalesce(c.merged_into, c.id) FROM client_leads l JOIN contacts c ON c.id = l.contact_id
                        WHERE l.id = e.lead_id),
                      (SELECT coalesce(c.merged_into, c.id) FROM projects p JOIN contacts c ON c.id = p.contact_id
                        WHERE p.id = e.project_id),
                      (SELECT coalesce(c.merged_into, c.id) FROM contacts c
                        WHERE (to_jsonb(e)->>'invite_to') IS NOT NULL AND c.email IS NOT NULL
                          AND lower(c.email) = lower(to_jsonb(e)->>'invite_to') LIMIT 1)
                    )::text AS contact_id
               FROM calendar_events e
              WHERE e.event_type = 'manual' AND e.starts_at < $2::timestamptz AND e.ends_at > $1::timestamptz
              ORDER BY abs(extract(epoch FROM e.starts_at - $3::timestamptz))
              LIMIT 5`,
      params: [from, to, start.toISOString()],
    },
  ])
  return rows.map((r) => ({
    eventId: String(r.event_id),
    title: String(r.title),
    contactId: (r.contact_id as string | null) ?? null,
  }))
}

/**
 * Jistá shoda: e-mail účastníka, který už má kontakt, nebo právě jedna
 * událost v kalendáři s kontaktem. Dvě různé osoby = nejistota, rozhodne AI
 * a pak Kryštof.
 */
export async function deterministicMatch(
  participants: MeetingParticipant[],
  hits: CalendarHit[],
  own: string[] = selfEmails(),
): Promise<DeterministicMatch | null> {
  const others = otherParticipants(participants, own)
  const byEmail = new Set<string>()
  for (const p of others) {
    for (const email of p.emails) {
      const found = await findContact(null, email)
      if (found !== null) byEmail.add(found)
    }
  }
  const nearestEvent = hits[0]?.eventId ?? null
  if (byEmail.size === 1) {
    const contactId = [...byEmail][0]
    const event = hits.find((h) => h.contactId === contactId)
    return { contactId, source: 'email', calendarEventId: event?.eventId ?? nearestEvent }
  }
  if (byEmail.size > 1) return null

  const withContact = hits.filter((h) => h.contactId !== null)
  const people = new Set(withContact.map((h) => h.contactId as string))
  if (people.size === 1) {
    return { contactId: [...people][0], source: 'kalendar', calendarEventId: withContact[0].eventId }
  }
  return null
}

export type Candidate = ContactSuggestion

async function contactsByIds(ids: string[]): Promise<Candidate[]> {
  if (ids.length === 0) return []
  const [rows] = await adminDb.batch([
    {
      text: `SELECT id::text AS id, display_name AS name, company, email, phone
               FROM contacts WHERE id = ANY($1::uuid[]) AND merged_into IS NULL`,
      params: [ids],
    },
  ])
  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    company: (r.company as string | null) ?? null,
    email: (r.email as string | null) ?? null,
    phone: (r.phone as string | null) ?? null,
  }))
}

/** Slova ze jména, podle kterých má smysl hledat (bez „Speaker 1", titulů a krátkých slov). */
export function searchTerms(name: string | null): string[] {
  if (!name) return []
  if (/^(speaker|mluvčí|řečník)\s*\d*$/i.test(name.trim())) return []
  const words = name
    .split(/[\s,.;()]+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3 && !/^(pan|paní|ing|mgr|bc|mudr|judr|speaker)$/i.test(w))
  return [...new Set([name.trim(), ...words])].slice(0, 4)
}

/**
 * Kandidáti pro AI: kontakty z kalendáře ve stejný čas a kontakty, jejichž
 * jméno, firma nebo e-mail odpovídá jménu účastníka. Nejvýš 12.
 */
export async function meetingCandidates(
  participants: MeetingParticipant[],
  hits: CalendarHit[],
  own: string[] = selfEmails(),
): Promise<Candidate[]> {
  const out = new Map<string, Candidate>()
  for (const c of await contactsByIds(hits.map((h) => h.contactId).filter((id): id is string => id !== null))) {
    out.set(c.id, c)
  }
  for (const p of otherParticipants(participants, own)) {
    for (const email of p.emails) {
      for (const c of await suggestContacts(email, 3)) out.set(c.id, c)
    }
    for (const term of searchTerms(p.name)) {
      for (const c of await suggestContacts(term, 4)) out.set(c.id, c)
      if (out.size >= 12) break
    }
    if (out.size >= 12) break
  }
  return [...out.values()].slice(0, 12)
}

/**
 * Po AI: klient, kterého AI v přepisu poznala jménem nebo firmou, ale mezi
 * kandidáty nebyl (Wispr Flow ho značí jen „Speaker 2"). Hledá se v kontaktech;
 * jen přesná shoda jména nebo firmy, nebo shoda e-mailu či telefonu, jinak nic.
 */
export async function lookupNamedClient(client: {
  name: string | null
  company: string | null
  email: string | null
  phone: string | null
}): Promise<string | null> {
  const byContact = await findContact(normalizePhone(client.phone), normalizeEmail(client.email))
  if (byContact !== null) return byContact
  const keys = [client.company, client.name].map((v) => nameKey(v)).filter((k) => k !== '')
  for (const raw of [client.company, client.name]) {
    if (!raw || raw.trim().length < 3) continue
    const hits = (await suggestContacts(raw, 6)).filter(
      (c) => keys.includes(nameKey(c.name)) || (c.company !== null && keys.includes(nameKey(c.company))),
    )
    const ids = new Set(hits.map((h) => h.id))
    if (ids.size === 1) return [...ids][0]
  }
  return null
}
