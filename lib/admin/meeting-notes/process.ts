import { adminDb } from '@/lib/admin/db'
import { propagateContact, type ContactValues } from '@/lib/admin/contact-sync'
import { ensureContact } from '@/lib/admin/contacts'
import { createNotification } from '@/lib/notifications'
import { normalizeEmail, normalizeIco, normalizePhone, trimOrNull } from '@/lib/contacts/normalize'
import type { MeetingAi } from '@/types/meeting-notes'
import { analyzeMeeting, type MeetingAnalyzer } from './ai'
import { composeMeetingEmail, hasEmailContent } from './email'
import { calendarHits, deterministicMatch, lookupNamedClient, meetingCandidates } from './match'
import {
  claimMeetingNote,
  failMeetingAi,
  linkMeetingContact,
  loadMeetingNote,
  meetingTitle,
  pendingMeetingNoteIds,
  saveGmailDraft,
  saveGmailError,
  saveMeetingAi,
  type ContactSource,
} from './store'

/**
 * Celý tok jedné schůzky (R-144):
 * přepis → jistá shoda klienta (e-mail, kalendář) → AI shrnutí a návrh klienta
 * → uložení → koncept e-mailu v Gmailu, když je klient jistý a má e-mail
 * → upozornění do zvonku.
 *
 * Návrh AI se **nepřiřadí sám** — přepis je text, který mluvil klient, a podle
 * R-111 se z takového textu nic nevykoná bez kliknutí. Koncept e-mailu vznikne
 * až u jistého klienta; jinak po potvrzení klienta v detailu schůzky.
 */

export type GmailDrafter = {
  available: () => Promise<boolean>
  create: (input: { to: string; subject: string; text: string; html: string }) => Promise<{ draftId: string; messageId: string | null }>
  remove: (draftId: string) => Promise<void>
}

/** Skutečný Gmail se načítá líně — `server-only` modul nesmí do testů ani do klienta. */
async function realGmail(): Promise<GmailDrafter> {
  const gmail = await import('@/lib/admin/google/gmail')
  return { available: gmail.gmailDraftsAvailable, create: (i) => gmail.createGmailDraft(i), remove: (id) => gmail.deleteGmailDraft(id) }
}

export type ProcessDeps = { analyze?: MeetingAnalyzer; gmail?: GmailDrafter; notify?: boolean }

export type ProcessResult =
  | { ok: true; contactId: string | null; contactSource: ContactSource | null; draft: DraftResult }
  | { ok: false; error: string; skipped?: boolean }

export async function processMeetingNote(id: string, deps: ProcessDeps = {}): Promise<ProcessResult> {
  const note = await claimMeetingNote(id)
  if (note === null) return { ok: false, error: 'Schůzka se už zpracovává nebo je hotová.', skipped: true }

  try {
    const hits = await calendarHits(note.startedAt, note.endedAt)
    const sure = note.contactId === null ? await deterministicMatch(note.participants, hits) : null
    const candidates = await meetingCandidates(note.participants, hits)
    if (sure !== null && !candidates.some((c) => c.id === sure.contactId)) {
      // Jistý klient musí být i mezi kandidáty, ať ho AI pozná v přepisu podle jména.
      const [rows] = await adminDb.batch([
        { text: `SELECT id::text AS id, display_name AS name, company, email, phone FROM contacts WHERE id = $1`, params: [sure.contactId] },
      ])
      if (rows[0]) {
        candidates.unshift({
          id: String(rows[0].id),
          name: String(rows[0].name),
          company: (rows[0].company as string | null) ?? null,
          email: (rows[0].email as string | null) ?? null,
          phone: (rows[0].phone as string | null) ?? null,
        })
      }
    }

    const analyze = deps.analyze ?? analyzeMeeting
    const result = await analyze({
      title: note.title,
      startedAt: note.startedAt,
      participants: note.participants,
      sourceSummary: note.sourceSummary,
      transcript: note.transcript,
      candidates,
    })
    if (!result.ok) {
      await failMeetingAi(note.id, result.error)
      return { ok: false, error: result.error }
    }

    const ai = result.ai
    // Klient, kterého AI poznala jménem nebo firmou, ale mezi kandidáty nebyl.
    if (ai.candidateId === null && ai.isClient) {
      const found = await lookupNamedClient(ai.client)
      if (found !== null) {
        ai.candidateId = found
        ai.matchReason = ai.matchReason || 'Jméno nebo firma ze schůzky sedí na kontakt.'
      }
    }

    await saveMeetingAi(note.id, {
      ai,
      contactId: sure?.contactId ?? null,
      contactSource: sure?.source ?? null,
      calendarEventId: sure?.calendarEventId ?? hits[0]?.eventId ?? null,
    })

    const contactId = note.contactId ?? sure?.contactId ?? null
    const contactSource = note.contactSource ?? sure?.source ?? null
    let draft: DraftResult = { status: 'skipped', reason: 'Klient zatím není potvrzený.' }
    if (contactId !== null && note.gmailDraftId === null) {
      draft = await draftMeetingEmail(note.id, { gmail: deps.gmail })
    }

    if (deps.notify !== false) {
      const title = meetingTitle(ai, note.title, note.startedAt)
      await createNotification({
        type: 'meeting_note',
        title: `Přepis schůzky: ${title}`.slice(0, 200),
        body:
          contactId !== null
            ? draft.status === 'created'
              ? 'Shrnutí je hotové a koncept e-mailu čeká v Gmailu.'
              : 'Shrnutí je hotové.'
            : ai.isClient
              ? 'Shrnutí je hotové. Potvrďte, o kterého klienta jde.'
              : 'Shrnutí je hotové. Vypadá to, že se netýká klienta.',
        link: `/dashboard/schuzky/${note.id}`,
      }).catch(() => undefined)
    }

    return { ok: true, contactId, contactSource, draft }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'neznámá chyba'
    console.error('[meeting-notes] zpracování selhalo:', message)
    await failMeetingAi(note.id, 'Zpracování selhalo. Zkuste to znovu.').catch(() => undefined)
    return { ok: false, error: 'Zpracování selhalo.' }
  }
}

export type DraftResult =
  | { status: 'created'; to: string }
  | { status: 'skipped'; reason: string }
  | { status: 'failed'; reason: string }

/**
 * Založí (nebo znovu založí) koncept e-mailu v Gmailu. Adresát je vždy e-mail
 * **přiřazeného kontaktu** — ne adresa, kterou AI vyčetla z přepisu; ta se do
 * kontaktu dostane jen potvrzením klienta.
 */
export async function draftMeetingEmail(id: string, deps: { gmail?: GmailDrafter } = {}): Promise<DraftResult> {
  const note = await loadMeetingNote(id)
  if (note === null) return { status: 'failed', reason: 'Schůzka neexistuje.' }
  if (note.contact === null) return { status: 'skipped', reason: 'Nejdřív potvrďte, o kterého klienta jde.' }
  if (note.ai === null) return { status: 'skipped', reason: 'Shrnutí ještě není hotové.' }
  const to = normalizeEmail(note.contact.email)
  if (to === null) {
    await saveGmailError(id, 'Klient nemá e-mail. Doplňte ho v kontaktu.')
    return { status: 'skipped', reason: 'Klient nemá e-mail. Doplňte ho v kontaktu.' }
  }
  if (!hasEmailContent(note.ai)) {
    return { status: 'skipped', reason: 'Ze schůzky nevyplynula žádná dohoda ani další krok.' }
  }

  const gmail = deps.gmail ?? (await realGmail())
  if (!(await gmail.available())) {
    const reason = 'Google nemá oprávnění ke konceptům. Propojte Google v Profilu znovu.'
    await saveGmailError(id, reason)
    return { status: 'skipped', reason }
  }

  try {
    const mail = composeMeetingEmail(note.ai, note.startedAt)
    if (note.gmailDraftId) await gmail.remove(note.gmailDraftId).catch(() => undefined)
    const created = await gmail.create({ to, ...mail })
    await saveGmailDraft(id, { to, draftId: created.draftId, messageId: created.messageId })
    return { status: 'created', to }
  } catch (err) {
    const reason = err instanceof Error ? err.message.slice(0, 300) : 'Koncept se nepodařilo založit.'
    await saveGmailError(id, reason)
    return { status: 'failed', reason }
  }
}

export type FillPlan = { field: 'company' | 'email' | 'phone' | 'ico'; label: string; value: string }

const FIELD_LABEL: Record<FillPlan['field'], string> = { company: 'Firma', email: 'E-mail', phone: 'Telefon', ico: 'IČO' }

/**
 * Co se do kontaktu doplní z přepisu: jen **prázdná** pole (R-141 — ručně
 * zadaný údaj se nepřepisuje). Ukazuje se v detailu ještě před potvrzením.
 */
export function plannedFill(
  current: { company: string | null; email: string | null; phone: string | null; ico: string | null } | null,
  client: MeetingAi['client'],
): FillPlan[] {
  const next = {
    company: trimOrNull(client.company),
    email: normalizeEmail(client.email),
    phone: normalizePhone(client.phone),
    ico: normalizeIco(client.ico),
  }
  const out: FillPlan[] = []
  for (const field of ['company', 'email', 'phone', 'ico'] as const) {
    const value = next[field]
    if (value === null) continue
    if (current !== null && current[field] !== null && current[field] !== '') continue
    out.push({ field, label: FIELD_LABEL[field], value })
  }
  return out
}

/**
 * Doplní kontakt z přepisu: prázdná pole, a e-mail a telefon jen když je
 * nemá jiný kontakt (to je duplicita ke sloučení, ne oprava). Pak propíše
 * změnu do Hovorů, zakázek a schůzek (R-141).
 */
export async function fillContactFromMeeting(contactId: string, client: MeetingAi['client']): Promise<string[]> {
  const [before] = await adminDb.batch([
    { text: `SELECT company, email, phone, ico FROM contacts WHERE id = $1`, params: [contactId] },
  ])
  if (!before[0]) return []
  const current = {
    company: (before[0].company as string | null) ?? null,
    email: (before[0].email as string | null) ?? null,
    phone: (before[0].phone as string | null) ?? null,
    ico: (before[0].ico as string | null) ?? null,
  }
  const plan = plannedFill(current, client)
  if (plan.length === 0) return []
  const value = (f: FillPlan['field']) => plan.find((p) => p.field === f)?.value ?? null

  const [rows] = await adminDb.batch([
    {
      text: `UPDATE contacts c SET
               company = coalesce(c.company, $2),
               ico = coalesce(c.ico, $5),
               email = CASE WHEN c.email IS NULL AND $3::text IS NOT NULL AND NOT EXISTS (
                         SELECT 1 FROM contacts d WHERE d.merged_into IS NULL AND d.id <> c.id
                            AND d.email IS NOT NULL AND lower(d.email) = lower($3::text))
                       THEN $3 ELSE c.email END,
               phone = CASE WHEN c.phone IS NULL AND $4::text IS NOT NULL AND NOT EXISTS (
                         SELECT 1 FROM contacts d WHERE d.merged_into IS NULL AND d.id <> c.id AND d.phone = $4::text)
                       THEN $4 ELSE c.phone END,
               updated_at = now()
             WHERE c.id = $1
             RETURNING company, email, phone, ico`,
      params: [contactId, value('company'), value('email'), value('phone'), value('ico')],
    },
  ])
  const after = rows[0] ?? {}
  const filled = plan.filter((p) => (after[p.field] ?? null) === p.value && current[p.field] === null).map((p) => p.label)
  const previous: ContactValues = { email: current.email, phone: current.phone }
  if (after.email !== current.email || after.phone !== current.phone) {
    await propagateContact(contactId, previous).catch((err: unknown) => {
      console.error('[meeting-notes] propis kontaktu selhal:', err instanceof Error ? err.message : 'unknown')
    })
  }
  return filled
}

export type ConfirmResult =
  | { ok: true; contactId: string; filled: string[]; draft: DraftResult }
  | { ok: false; error: string }

/**
 * Kryštof potvrdil klienta: přiřadí se, doplní se prázdné údaje z přepisu
 * a založí se koncept e-mailu. `contactId: null` = klient je nový, založí se
 * kontakt z údajů, které AI v přepisu našla.
 */
export async function confirmMeetingClient(
  id: string,
  contactId: string | null,
  deps: { gmail?: GmailDrafter } = {},
): Promise<ConfirmResult> {
  const note = await loadMeetingNote(id)
  if (note === null) return { ok: false, error: 'Schůzka neexistuje.' }
  const client = note.ai?.client ?? { name: null, company: null, email: null, phone: null, ico: null, web: null }

  let target = contactId
  if (target === null) {
    if (!client.name && !client.company) return { ok: false, error: 'V přepisu nezaznělo jméno ani firma. Vyberte kontakt ze seznamu.' }
    target = await ensureContact({
      name: client.name ?? client.company,
      company: client.company,
      email: client.email,
      phone: client.phone,
      source: 'schuzka',
      seenAt: note.startedAt,
    })
    if (target === null) return { ok: false, error: 'Kontakt se nepodařilo založit.' }
  }

  if (!(await linkMeetingContact(id, target, 'potvrzeno'))) return { ok: false, error: 'Kontakt neexistuje.' }
  const filled = await fillContactFromMeeting(target, client)
  const draft = note.gmailDraftId === null || note.contact?.id !== target ? await draftMeetingEmail(id, deps) : { status: 'skipped' as const, reason: 'Koncept už je v Gmailu.' }
  return { ok: true, contactId: target, filled, draft }
}

/** Denní pojistka: dokončí schůzky, kterým shrnutí nedoběhlo. */
export async function finishPendingMeetingNotes(limit = 3, deps: ProcessDeps = {}): Promise<number> {
  let ids: string[]
  try {
    ids = await pendingMeetingNoteIds(limit)
  } catch (err) {
    if ((err as { code?: string })?.code === '42P01') return 0
    throw err
  }
  let done = 0
  for (const id of ids) {
    const result = await processMeetingNote(id, deps)
    if (result.ok) done++
  }
  return done
}
