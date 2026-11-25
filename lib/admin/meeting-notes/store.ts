import { adminDb } from '@/lib/admin/db'
import { normalizeEmail } from '@/lib/contacts/normalize'
import { storedMeetingAiSchema, type MeetingAi, type MeetingParticipant } from '@/types/meeting-notes'

/**
 * Schůzky a přepisy (R-144, migrace 134): čtení a zápis `meeting_notes`.
 *
 * Přepis (`transcript`) se ukládá přesně tak, jak přišel, a nic ho později
 * nepřepisuje. AI výsledek je zvlášť v `ai` a jde kdykoli vyrobit znovu.
 * Klient je v `contact_id`; čte se přes kořen sloučení (R-095), takže sloučený
 * kontakt vede na toho, do kterého je sloučený.
 */

export type MeetingSource = 'wispr' | 'manual'
export type ContactSource = 'email' | 'telefon' | 'kalendar' | 'potvrzeno'

export type IngestInput = {
  source: MeetingSource
  sourceId: string | null
  title: string | null
  startedAt: string | null
  endedAt: string | null
  shareLink: string | null
  participants: MeetingParticipant[]
  sourceSummary: string | null
  transcript: string
  declaredChars: number | null
}

export type IngestResult = { id: string; created: boolean; changed: boolean }

/** Odkaz na schůzku jen z notes.wisprflow.ai — nic jiného se do `href` nedostane. */
export function safeShareLink(raw: string | null | undefined): string | null {
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' || url.hostname !== 'notes.wisprflow.ai') return null
    return url.toString()
  } catch {
    return null
  }
}

/**
 * Konektor Wispr Flow obaluje přepis značkami (`<<<PARTICIPANT NAMES …>>>`,
 * `<<<END TRANSCRIPT>>>`) a při stránkování přidává `(...truncated, … )`.
 * Ty do rozhovoru nepatří; most je má vynechat, a když je tam nechá, smažou
 * se tady. Jinak se v textu nemění nic.
 */
export function stripWisprMarkers(transcript: string): string {
  return transcript
    .split('\n')
    .filter((line) => !/^<<<[^\n]*>>>\s*$/.test(line.trim()) && !/^\(\.\.\.truncated, \d+ chars remaining[^)]*\)\s*$/.test(line.trim()))
    .join('\n')
    .replace(/^\n+|\n+$/g, '')
}

export function normalizeParticipants(raw: unknown): MeetingParticipant[] {
  if (!Array.isArray(raw)) return []
  const out: MeetingParticipant[] = []
  for (const item of raw.slice(0, 50)) {
    if (item === null || typeof item !== 'object') continue
    const p = item as Record<string, unknown>
    const name = typeof p.name === 'string' && p.name.trim() !== '' ? p.name.trim().slice(0, 200) : null
    const emails = Array.isArray(p.emails)
      ? p.emails.map((e) => (typeof e === 'string' ? normalizeEmail(e) : null)).filter((e): e is string => e !== null)
      : []
    out.push({
      name,
      emails: [...new Set(emails)].slice(0, 10),
      spoke: p.spoke === true,
      role: typeof p.role === 'string' && p.role.trim() !== '' ? p.role.trim().slice(0, 40) : null,
      self: p.self === true || p.role === 'self',
    })
  }
  return out
}

/**
 * Uloží schůzku. Z Wispr Flow podle `source_id`: stejná schůzka podruhé nic
 * nezmění, změněný přepis (Wispr ho po schůzce ještě jednou přepočítá) ho
 * nahradí a AI se pustí znovu. Přiřazený klient, koncept e-mailu i skrytí
 * zůstávají.
 */
export async function ingestMeetingNote(input: IngestInput): Promise<IngestResult> {
  const params = [
    input.source,
    input.sourceId,
    input.title,
    input.startedAt,
    input.endedAt,
    safeShareLink(input.shareLink),
    JSON.stringify(input.participants),
    input.sourceSummary,
    input.transcript,
    input.declaredChars,
  ]

  if (input.sourceId === null) {
    const [rows] = await adminDb.batch([
      {
        text: `INSERT INTO meeting_notes (source, source_id, title, started_at, ended_at, share_link, participants,
                                          source_summary, transcript, declared_chars)
               VALUES ($1, $2, $3, $4::timestamptz, $5::timestamptz, $6, $7::jsonb, $8, $9, $10)
               RETURNING id::text`,
        params,
      },
    ])
    return { id: String(rows[0].id), created: true, changed: true }
  }

  const [rows] = await adminDb.batch([
    {
      // Bez změny se řádek nepřepisuje (WHERE v DO UPDATE), takže `updated_at`
      // i běžící zpracování zůstanou, jak jsou. Druhá větev UNION pak vrátí
      // existující id.
      text: `WITH ins AS (
               INSERT INTO meeting_notes (source, source_id, title, started_at, ended_at, share_link, participants,
                                          source_summary, transcript, declared_chars)
               VALUES ($1, $2, $3, $4::timestamptz, $5::timestamptz, $6, $7::jsonb, $8, $9, $10)
               ON CONFLICT (source, source_id) WHERE source_id IS NOT NULL DO UPDATE SET
                 title = EXCLUDED.title,
                 started_at = EXCLUDED.started_at,
                 ended_at = EXCLUDED.ended_at,
                 share_link = EXCLUDED.share_link,
                 participants = EXCLUDED.participants,
                 source_summary = EXCLUDED.source_summary,
                 transcript = EXCLUDED.transcript,
                 declared_chars = EXCLUDED.declared_chars,
                 ai_status = CASE WHEN meeting_notes.transcript IS DISTINCT FROM EXCLUDED.transcript
                                  THEN 'pending' ELSE meeting_notes.ai_status END,
                 ai_attempts = CASE WHEN meeting_notes.transcript IS DISTINCT FROM EXCLUDED.transcript
                                    THEN 0 ELSE meeting_notes.ai_attempts END,
                 updated_at = now()
               WHERE meeting_notes.transcript IS DISTINCT FROM EXCLUDED.transcript
                  OR meeting_notes.title IS DISTINCT FROM EXCLUDED.title
                  OR meeting_notes.started_at IS DISTINCT FROM EXCLUDED.started_at
                  OR meeting_notes.ended_at IS DISTINCT FROM EXCLUDED.ended_at
                  OR meeting_notes.participants IS DISTINCT FROM EXCLUDED.participants
                  OR meeting_notes.share_link IS DISTINCT FROM EXCLUDED.share_link
               RETURNING id, (xmax = 0) AS created
             )
             SELECT id::text, created, true AS changed FROM ins
             UNION ALL
             SELECT id::text, false, false FROM meeting_notes
              WHERE source = $1 AND source_id = $2 AND NOT EXISTS (SELECT 1 FROM ins)`,
      params,
    },
  ])
  const row = rows[0]
  return { id: String(row.id), created: row.created === true, changed: row.changed === true }
}

/** Které schůzky z Wispr Flow už tu jsou — most pak nemusí stahovat jejich přepis. */
export async function knownMeetingIds(source: MeetingSource, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return []
  const [rows] = await adminDb.batch([
    {
      text: `SELECT source_id FROM meeting_notes WHERE source = $1 AND source_id = ANY($2::text[])`,
      params: [source, ids],
    },
  ])
  return rows.map((r) => String(r.source_id))
}

export type NoteForProcessing = {
  id: string
  title: string | null
  startedAt: string | null
  endedAt: string | null
  participants: MeetingParticipant[]
  sourceSummary: string | null
  transcript: string
  contactId: string | null
  contactSource: ContactSource | null
  gmailDraftId: string | null
}

/**
 * Zamkne schůzku pro zpracování. Dva souběžné běhy (příjem a denní pojistka)
 * ji nedostanou oba: zámek platí 5 minut, pak ho smí převzít další běh.
 * Po třech neúspěšných pokusech se schůzka nechá být, dokud ji Kryštof
 * nepustí znovu.
 */
export async function claimMeetingNote(id: string): Promise<NoteForProcessing | null> {
  const [rows] = await adminDb.batch([
    {
      text: `UPDATE meeting_notes
                SET ai_claimed_at = now(), ai_attempts = ai_attempts + 1, updated_at = now()
              WHERE id = $1
                AND ai_status <> 'done'
                AND ai_attempts < 3
                AND (ai_claimed_at IS NULL OR ai_claimed_at < now() - interval '5 minutes')
              RETURNING id::text, title, started_at, ended_at, participants, source_summary, transcript,
                        contact_id::text, contact_source, gmail_draft_id`,
      params: [id],
    },
  ])
  if (rows.length === 0) return null
  const r = rows[0]
  return {
    id: String(r.id),
    title: (r.title as string | null) ?? null,
    startedAt: isoOrNull(r.started_at),
    endedAt: isoOrNull(r.ended_at),
    participants: normalizeParticipants(r.participants),
    sourceSummary: (r.source_summary as string | null) ?? null,
    transcript: String(r.transcript),
    contactId: (r.contact_id as string | null) ?? null,
    contactSource: (r.contact_source as ContactSource | null) ?? null,
    gmailDraftId: (r.gmail_draft_id as string | null) ?? null,
  }
}

export async function saveMeetingAi(
  id: string,
  result: { ai: MeetingAi; contactId: string | null; contactSource: ContactSource | null; calendarEventId: string | null },
): Promise<void> {
  await adminDb.batch([
    {
      // Klienta přiřazeného dřív (potvrzeného Kryštofem) nové zpracování nepřepíše.
      text: `UPDATE meeting_notes SET
               ai = $2::jsonb, ai_status = 'done', ai_error = NULL, ai_at = now(), ai_claimed_at = NULL,
               contact_id = coalesce(contact_id, $3::uuid),
               contact_source = CASE WHEN contact_id IS NULL THEN $4 ELSE contact_source END,
               contact_at = CASE WHEN contact_id IS NULL AND $3::uuid IS NOT NULL THEN now() ELSE contact_at END,
               calendar_event_id = coalesce(calendar_event_id, $5::uuid),
               updated_at = now()
             WHERE id = $1`,
      params: [id, JSON.stringify(result.ai), result.contactId, result.contactId ? result.contactSource : null, result.calendarEventId],
    },
  ])
}

export async function failMeetingAi(id: string, error: string): Promise<void> {
  await adminDb.batch([
    {
      text: `UPDATE meeting_notes SET ai_status = 'failed', ai_error = $2, ai_claimed_at = NULL, updated_at = now() WHERE id = $1`,
      params: [id, error.slice(0, 500)],
    },
  ])
}

/** „Zpracovat znovu": nový pokus od nuly, klient a koncept zůstávají. */
export async function resetMeetingAi(id: string): Promise<boolean> {
  const [rows] = await adminDb.batch([
    {
      text: `UPDATE meeting_notes SET ai_status = 'pending', ai_attempts = 0, ai_claimed_at = NULL, ai_error = NULL, updated_at = now()
              WHERE id = $1 RETURNING id`,
      params: [id],
    },
  ])
  return rows.length > 0
}

export async function linkMeetingContact(id: string, contactId: string, source: ContactSource): Promise<boolean> {
  const [rows] = await adminDb.batch([
    {
      text: `UPDATE meeting_notes SET contact_id = $2, contact_source = $3, contact_at = now(), updated_at = now()
              WHERE id = $1 AND EXISTS (SELECT 1 FROM contacts WHERE id = $2) RETURNING id`,
      params: [id, contactId, source],
    },
  ])
  return rows.length > 0
}

export async function unlinkMeetingContact(id: string): Promise<{ contactId: string | null; source: ContactSource | null } | null> {
  const [rows] = await adminDb.batch([
    {
      text: `UPDATE meeting_notes n SET contact_id = NULL, contact_source = NULL, contact_at = NULL, updated_at = now()
               FROM (SELECT id, contact_id, contact_source FROM meeting_notes WHERE id = $1) old
              WHERE n.id = old.id
              RETURNING old.contact_id::text AS contact_id, old.contact_source`,
      params: [id],
    },
  ])
  if (rows.length === 0) return null
  return { contactId: (rows[0].contact_id as string | null) ?? null, source: (rows[0].contact_source as ContactSource | null) ?? null }
}

export async function setMeetingHidden(id: string, hidden: boolean): Promise<boolean> {
  const [rows] = await adminDb.batch([
    {
      text: `UPDATE meeting_notes SET hidden_at = CASE WHEN $2 THEN coalesce(hidden_at, now()) ELSE NULL END, updated_at = now()
              WHERE id = $1 RETURNING id`,
      params: [id, hidden],
    },
  ])
  return rows.length > 0
}

export async function saveGmailDraft(id: string, draft: { to: string; draftId: string; messageId: string | null }): Promise<void> {
  await adminDb.batch([
    {
      text: `UPDATE meeting_notes SET email_to = $2, gmail_draft_id = $3, gmail_message_id = $4, gmail_draft_at = now(),
                                      gmail_error = NULL, updated_at = now()
              WHERE id = $1`,
      params: [id, draft.to, draft.draftId, draft.messageId],
    },
  ])
}

export async function saveGmailError(id: string, error: string | null): Promise<void> {
  await adminDb.batch([
    { text: `UPDATE meeting_notes SET gmail_error = $2, updated_at = now() WHERE id = $1`, params: [id, error?.slice(0, 500) ?? null] },
  ])
}

/** Pro denní pojistku: schůzky, které zpracování nedokončilo (výpadek, timeout). */
export async function pendingMeetingNoteIds(limit = 5): Promise<string[]> {
  const [rows] = await adminDb.batch([
    {
      text: `SELECT id::text FROM meeting_notes
              WHERE ai_status <> 'done' AND ai_attempts < 3 AND created_at < now() - interval '10 minutes'
              ORDER BY created_at LIMIT $1`,
      params: [limit],
    },
  ])
  return rows.map((r) => String(r.id))
}

/**
 * Retence (R-144): přepis obsahuje osobní údaje klienta. Schůzka se maže
 * 3 roky po konání, skrytá (netýká se klienta) po roce.
 */
export async function purgeMeetingNotes(): Promise<{ deleted: number }> {
  const [rows] = await adminDb.batch([
    {
      text: `DELETE FROM meeting_notes
              WHERE coalesce(started_at, created_at) < now() - interval '3 years'
                 OR (hidden_at IS NOT NULL AND hidden_at < now() - interval '1 year')
              RETURNING id`,
      params: [],
    },
  ])
  return { deleted: rows.length }
}

// ── Čtení pro obrazovky ─────────────────────────────────────────────

export type MeetingFilter = 'ke-kontrole' | 'vse' | 'skryte'

export type MeetingNoteRow = {
  id: string
  title: string
  startedAt: string | null
  minutes: number | null
  source: MeetingSource
  aiStatus: 'pending' | 'done' | 'failed'
  contactId: string | null
  contactName: string | null
  suggestedName: string | null
  isClient: boolean | null
  hasDraft: boolean
  hidden: boolean
}

export type MeetingContact = {
  id: string
  name: string
  company: string | null
  email: string | null
  phone: string | null
  ico: string | null
}

export type MeetingNoteDetail = {
  id: string
  source: MeetingSource
  title: string
  startedAt: string | null
  endedAt: string | null
  minutes: number | null
  shareLink: string | null
  participants: MeetingParticipant[]
  transcript: string
  declaredChars: number | null
  aiStatus: 'pending' | 'done' | 'failed'
  aiError: string | null
  ai: MeetingAi | null
  contact: MeetingContact | null
  contactSource: ContactSource | null
  candidate: MeetingContact | null
  emailTo: string | null
  gmailDraftId: string | null
  gmailDraftAt: string | null
  gmailError: string | null
  hidden: boolean
}

function isoOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const d = value instanceof Date ? value : new Date(String(value))
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function minutesBetween(start: string | null, end: string | null): number | null {
  if (!start || !end) return null
  const ms = new Date(end).getTime() - new Date(start).getTime()
  return ms > 0 ? Math.max(1, Math.round(ms / 60_000)) : null
}

export function parseMeetingAi(raw: unknown): MeetingAi | null {
  const parsed = storedMeetingAiSchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}

export function meetingTitle(ai: MeetingAi | null, title: string | null, startedAt: string | null): string {
  const fromAi = ai?.title.trim()
  if (fromAi) return fromAi
  if (title?.trim()) return title.trim()
  return startedAt ? 'Schůzka' : 'Schůzka bez názvu'
}

const ROOT_CONTACT = `LEFT JOIN contacts c0 ON c0.id = n.contact_id
                      LEFT JOIN contacts c ON c.id = coalesce(c0.merged_into, c0.id)`

export async function loadMeetingNotes(filter: MeetingFilter, limit = 100): Promise<MeetingNoteRow[]> {
  const where =
    filter === 'skryte'
      ? 'n.hidden_at IS NOT NULL'
      : filter === 'ke-kontrole'
        ? `n.hidden_at IS NULL AND n.contact_id IS NULL AND coalesce((n.ai->>'isClient')::boolean, true)`
        : 'n.hidden_at IS NULL'
  const [rows] = await adminDb.batch([
    {
      text: `SELECT n.id::text, n.title, n.started_at, n.ended_at, n.source, n.ai_status, n.ai,
                    n.gmail_draft_id IS NOT NULL AS has_draft, n.hidden_at IS NOT NULL AS hidden,
                    c.id::text AS contact_id, c.display_name AS contact_name
               FROM meeting_notes n ${ROOT_CONTACT}
              WHERE ${where}
              ORDER BY coalesce(n.started_at, n.created_at) DESC
              LIMIT $1`,
      params: [limit],
    },
  ])
  return rows.map((r) => {
    const ai = parseMeetingAi(r.ai)
    const startedAt = isoOrNull(r.started_at)
    return {
      id: String(r.id),
      title: meetingTitle(ai, (r.title as string | null) ?? null, startedAt),
      startedAt,
      minutes: minutesBetween(startedAt, isoOrNull(r.ended_at)),
      source: r.source as MeetingSource,
      aiStatus: r.ai_status as MeetingNoteRow['aiStatus'],
      contactId: (r.contact_id as string | null) ?? null,
      contactName: (r.contact_name as string | null) ?? null,
      suggestedName: ai ? (ai.client.company ?? ai.client.name) : null,
      isClient: ai ? ai.isClient : null,
      hasDraft: r.has_draft === true,
      hidden: r.hidden === true,
    }
  })
}

/** Kolik schůzek čeká, až Kryštof potvrdí klienta (hlavička seznamu). */
export async function countMeetingsToReview(): Promise<number> {
  const [rows] = await adminDb.batch([
    {
      text: `SELECT count(*)::int AS n FROM meeting_notes n
              WHERE n.hidden_at IS NULL AND n.contact_id IS NULL AND coalesce((n.ai->>'isClient')::boolean, true)`,
      params: [],
    },
  ])
  return Number(rows[0]?.n ?? 0)
}

function contactFrom(r: Record<string, unknown>, prefix: string): MeetingContact | null {
  const id = r[`${prefix}id`]
  if (id === null || id === undefined) return null
  return {
    id: String(id),
    name: String(r[`${prefix}name`]),
    company: (r[`${prefix}company`] as string | null) ?? null,
    email: (r[`${prefix}email`] as string | null) ?? null,
    phone: (r[`${prefix}phone`] as string | null) ?? null,
    ico: (r[`${prefix}ico`] as string | null) ?? null,
  }
}

export async function loadMeetingNote(id: string): Promise<MeetingNoteDetail | null> {
  const [rows] = await adminDb.batch([
    {
      text: `SELECT n.*, n.id::text AS note_id,
                    c.id::text AS c_id, c.display_name AS c_name, c.company AS c_company, c.email AS c_email,
                    c.phone AS c_phone, c.ico AS c_ico,
                    k.id::text AS k_id, k.display_name AS k_name, k.company AS k_company, k.email AS k_email,
                    k.phone AS k_phone, k.ico AS k_ico
               FROM meeting_notes n ${ROOT_CONTACT}
               LEFT JOIN contacts k0 ON k0.id = CASE WHEN (n.ai->>'candidateId') ~* '^[0-9a-f-]{36}$'
                                                    THEN (n.ai->>'candidateId')::uuid END
               LEFT JOIN contacts k ON k.id = coalesce(k0.merged_into, k0.id)
              WHERE n.id = $1`,
      params: [id],
    },
  ])
  if (rows.length === 0) return null
  const r = rows[0]
  const ai = parseMeetingAi(r.ai)
  const startedAt = isoOrNull(r.started_at)
  const endedAt = isoOrNull(r.ended_at)
  const contact = contactFrom(r, 'c_')
  const candidate = contactFrom(r, 'k_')
  return {
    id: String(r.note_id),
    source: r.source as MeetingSource,
    title: meetingTitle(ai, (r.title as string | null) ?? null, startedAt),
    startedAt,
    endedAt,
    minutes: minutesBetween(startedAt, endedAt),
    shareLink: safeShareLink(r.share_link as string | null),
    participants: normalizeParticipants(r.participants),
    transcript: String(r.transcript),
    declaredChars: r.declared_chars === null || r.declared_chars === undefined ? null : Number(r.declared_chars),
    aiStatus: r.ai_status as MeetingNoteDetail['aiStatus'],
    aiError: (r.ai_error as string | null) ?? null,
    ai,
    contact,
    contactSource: (r.contact_source as ContactSource | null) ?? null,
    candidate: contact !== null && candidate !== null && candidate.id === contact.id ? null : candidate,
    emailTo: (r.email_to as string | null) ?? null,
    gmailDraftId: (r.gmail_draft_id as string | null) ?? null,
    gmailDraftAt: isoOrNull(r.gmail_draft_at),
    gmailError: (r.gmail_error as string | null) ?? null,
    hidden: r.hidden_at !== null && r.hidden_at !== undefined,
  }
}

export type ContactMeetingRow = { id: string; title: string; startedAt: string | null; minutes: number | null }

/** Schůzky kontaktu i kontaktů do něj sloučených — na kartu kontaktu. */
export async function loadContactMeetingNotes(contactId: string, limit = 20): Promise<ContactMeetingRow[]> {
  try {
    const [rows] = await adminDb.batch([
      {
        text: `SELECT n.id::text, n.title, n.started_at, n.ended_at, n.ai
                 FROM meeting_notes n
                 JOIN contacts c ON c.id = n.contact_id
                WHERE coalesce(c.merged_into, c.id) = (SELECT coalesce(merged_into, id) FROM contacts WHERE id = $1)
                  AND n.hidden_at IS NULL
                ORDER BY coalesce(n.started_at, n.created_at) DESC
                LIMIT $2`,
        params: [contactId, limit],
      },
    ])
    return rows.map((r) => {
      const startedAt = isoOrNull(r.started_at)
      return {
        id: String(r.id),
        title: meetingTitle(parseMeetingAi(r.ai), (r.title as string | null) ?? null, startedAt),
        startedAt,
        minutes: minutesBetween(startedAt, isoOrNull(r.ended_at)),
      }
    })
  } catch (err) {
    // Bez migrace 134 tabulka není — karta kontaktu se kvůli tomu nesmí rozbít.
    if ((err as { code?: string })?.code === '42P01') return []
    throw err
  }
}
