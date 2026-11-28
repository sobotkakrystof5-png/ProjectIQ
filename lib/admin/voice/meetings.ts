import 'server-only'
import { adminDb, q, type AdminQuery } from '@/lib/admin/db'
import {
  DEFAULT_SPEAKERS,
  buildTranscript,
  transcriptCheck,
  transcriptText,
  transcriptWords,
  type MeetingTrack,
  type MeetingTurnRow,
  type SpeakerNames,
  type TranscriptBlock,
  type TranscriptCheck,
} from './meeting-transcript'
import { suggestContacts } from '@/lib/admin/contacts'
import type { MeetingCreateInput, MeetingTurnMeta, MeetingTurnOutcome } from './meeting-turn'
import { parseStoredSummary, summaryText, type MeetingSummary } from './meeting-summary'

/**
 * ZakazIQ Voice — schůzky (R-151, migrace 139): databáze schůzek a promluv.
 *
 * Mac smí jen svoje schůzky (`device_id`), admin všechny. Text se nikdy
 * nelogguje. Čtení v dávkách přes `adminDb` (R-092).
 */

const iso = (value: unknown): string | null => (value ? new Date(value as string).toISOString() : null)

export interface MeetingListItem {
  id: string
  title: string | null
  startedAt: string
  durationMs: number | null
  status: 'recording' | 'done'
  appName: string | null
  contactName: string | null
  hasSummary: boolean
  turns: number
}

export interface MeetingDetail extends MeetingListItem {
  endedAt: string | null
  contactId: string | null
  blocks: (TranscriptBlock & { label: string })[]
  transcript: string
  words: number
  summary: MeetingSummary | null
  summaryText: string | null
  summaryAt: string | null
  costUsd: number
  /** Promluvy, u kterých přepis selhal (Mac je pošle znovu). */
  failedTurns: number
  /** Slyšel Mac obě strany? Kontrola po schůzce. */
  check: TranscriptCheck
}

type MeetingRow = {
  id: string
  title: string | null
  started_at: string
  ended_at: string | null
  duration_ms: number | null
  status: 'recording' | 'done'
  app_name: string | null
  contact_id: string | null
  contact_name: string | null
  summary: unknown
  summary_at: string | null
  cost_usd: string | number
  turns: string | number
}

const toListItem = (r: MeetingRow): MeetingListItem => ({
  id: r.id,
  title: r.title,
  startedAt: iso(r.started_at) ?? '',
  durationMs: r.duration_ms === null ? null : Number(r.duration_ms),
  status: r.status,
  appName: r.app_name,
  contactName: r.contact_name,
  hasSummary: r.summary !== null,
  turns: Number(r.turns),
})

// `q` neumí skládat kusy dotazů, proto hotový text a parametry ručně.
const MEETING_SELECT = `
  SELECT m.id, m.title, m.started_at, m.ended_at, m.duration_ms, m.status, m.app_name, m.contact_id,
         c.display_name AS contact_name, m.summary, m.summary_at, m.cost_usd,
         (SELECT count(*) FROM voice_meeting_turns t WHERE t.meeting_id = m.id AND t.status = 'ok') AS turns
  FROM voice_meetings m LEFT JOIN contacts c ON c.id = m.contact_id`

const meetingQuery = (where: string, params: unknown[]): AdminQuery => ({ text: `${MEETING_SELECT} ${where}`, params })

/** Založí schůzku. Stejné `id` podruhé nic nezmění; cizí zařízení dostane `false`. */
export async function createMeeting(input: MeetingCreateInput, deviceId: string): Promise<boolean> {
  const rows = await adminDb<{ device_id: string | null }>`
    INSERT INTO voice_meetings (id, device_id, title, started_at, app_bundle_id, app_name)
    VALUES (${input.id}, ${deviceId}, ${input.title ?? null}, ${input.startedAt}, ${input.app.bundleId || null}, ${input.app.name || null})
    ON CONFLICT (id) DO UPDATE SET updated_at = voice_meetings.updated_at
    RETURNING device_id
  `
  return rows[0]?.device_id === deviceId
}

/** Patří schůzka tomuhle zařízení? */
export async function meetingOwnedBy(id: string, deviceId: string): Promise<boolean> {
  const rows = await adminDb<{ id: string }>`SELECT id FROM voice_meetings WHERE id = ${id} AND device_id = ${deviceId}`
  return rows.length > 0
}

export type StoredTurn = {
  status: string
  text: string | null
}

export async function findTurn(meetingId: string, track: MeetingTrack, idx: number): Promise<StoredTurn | null> {
  const rows = await adminDb<StoredTurn>`
    SELECT status, text FROM voice_meeting_turns WHERE meeting_id = ${meetingId} AND track = ${track} AND idx = ${idx}
  `
  return rows[0] ?? null
}

/** Uloží promluvu (neúspěšný starší pokus přepíše) a přičte cenu ke schůzce. */
export async function saveTurn(meetingId: string, meta: MeetingTurnMeta, out: MeetingTurnOutcome): Promise<void> {
  const cost = Number(out.costUsd.toFixed(6))
  await adminDb.batch([
    q`DELETE FROM voice_meeting_turns
      WHERE meeting_id = ${meetingId} AND track = ${meta.track} AND idx = ${meta.idx} AND status = 'error'`,
    q`
      INSERT INTO voice_meeting_turns (
        meeting_id, track, idx, start_ms, duration_ms, speech_ms, status, text, guards,
        stt_provider, stt_model, stt_ms, cost_usd
      ) VALUES (
        ${meetingId}, ${meta.track}, ${meta.idx}, ${meta.startMs}, ${meta.durationMs}, ${meta.speechMs},
        ${out.status}, ${out.text || null}, ${out.guards}, ${out.sttProvider}, ${out.sttModel}, ${out.sttMs}, ${cost}
      )
      ON CONFLICT (meeting_id, track, idx) DO NOTHING
    `,
    q`UPDATE voice_meetings SET cost_usd = cost_usd + ${cost}, updated_at = now() WHERE id = ${meetingId}`,
  ])
}

export async function finishMeeting(id: string, deviceId: string, endedAt: string, durationMs: number): Promise<boolean> {
  const rows = await adminDb<{ id: string }>`
    UPDATE voice_meetings SET status = 'done', ended_at = ${endedAt}, duration_ms = ${durationMs}, updated_at = now()
    WHERE id = ${id} AND device_id = ${deviceId}
    RETURNING id
  `
  return rows.length > 0
}

/** Posledních 100 schůzek (Mac jen svoje, admin `deviceId = null` všechny). */
export async function listMeetings(deviceId: string | null): Promise<MeetingListItem[]> {
  const query = deviceId
    ? meetingQuery('WHERE m.device_id = $1 ORDER BY m.started_at DESC LIMIT 100', [deviceId])
    : meetingQuery('ORDER BY m.started_at DESC LIMIT 100', [])
  const [rows] = await adminDb.batch([query])
  return (rows as MeetingRow[]).map(toListItem)
}

type TurnDbRow = { track: MeetingTrack; idx: number; start_ms: number; duration_ms: number; status: string; text: string | null }

/** Schůzka s přepisem. `deviceId = null` = admin (jakákoli schůzka). */
export async function loadMeeting(id: string, deviceId: string | null): Promise<MeetingDetail | null> {
  const [meetingRows, turnRows] = await adminDb.batch([
    deviceId ? meetingQuery('WHERE m.id = $1 AND m.device_id = $2', [id, deviceId]) : meetingQuery('WHERE m.id = $1', [id]),
    q`SELECT track, idx, start_ms, duration_ms, status, text FROM voice_meeting_turns
      WHERE meeting_id = ${id} ORDER BY start_ms, track, idx`,
  ])
  const r = (meetingRows as MeetingRow[])[0]
  if (!r) return null
  const turns: MeetingTurnRow[] = (turnRows as TurnDbRow[]).map((t) => ({
    track: t.track,
    idx: Number(t.idx),
    startMs: Number(t.start_ms),
    durationMs: Number(t.duration_ms),
    status: t.status,
    text: t.text,
  }))
  const names: SpeakerNames = { ...DEFAULT_SPEAKERS, other: r.contact_name?.trim() || DEFAULT_SPEAKERS.other }
  const blocks = buildTranscript(turns)
  const summary = parseStoredSummary(r.summary)
  return {
    ...toListItem(r),
    endedAt: iso(r.ended_at),
    contactId: r.contact_id,
    blocks: blocks.map((b) => ({ ...b, label: names[b.speaker] })),
    transcript: transcriptText(blocks, names),
    words: transcriptWords(blocks),
    summary,
    summaryText: summary ? summaryText(summary) : null,
    summaryAt: iso(r.summary_at),
    costUsd: Number(r.cost_usd),
    failedTurns: turns.filter((t) => t.status === 'error').length,
    check: transcriptCheck(turns),
  }
}

/** Uloží shrnutí a (když schůzka název nemá) i název od modelu. */
export async function saveMeetingSummary(id: string, summary: MeetingSummary, model: string, costUsd: number): Promise<void> {
  await adminDb`
    UPDATE voice_meetings
    SET summary = ${JSON.stringify(summary)}::jsonb, summary_at = now(), summary_model = ${model},
        title = COALESCE(title, ${summary.title.slice(0, 160)}),
        cost_usd = cost_usd + ${Number(costUsd.toFixed(6))}, updated_at = now()
    WHERE id = ${id}
  `
}

/** Smaže schůzku i s promluvami (cizí klíč). `deviceId = null` = admin. */
export async function deleteMeeting(id: string, deviceId: string | null): Promise<boolean> {
  const rows = deviceId
    ? await adminDb<{ id: string }>`DELETE FROM voice_meetings WHERE id = ${id} AND device_id = ${deviceId} RETURNING id`
    : await adminDb<{ id: string }>`DELETE FROM voice_meetings WHERE id = ${id} RETURNING id`
  return rows.length > 0
}

/** Přiřadí schůzku ke kontaktu (jen admin). `null` = odpojit. */
export async function setMeetingContact(id: string, contactId: string | null): Promise<boolean> {
  const rows = await adminDb<{ id: string }>`
    UPDATE voice_meetings SET contact_id = ${contactId}, updated_at = now() WHERE id = ${id} RETURNING id
  `
  return rows.length > 0
}

export async function renameMeeting(id: string, title: string | null): Promise<boolean> {
  const rows = await adminDb<{ id: string }>`
    UPDATE voice_meetings SET title = ${title}, updated_at = now() WHERE id = ${id} RETURNING id
  `
  return rows.length > 0
}

/** Kontakt, jak ho vidí Mac: jen jméno a firma, ne e-mail ani telefon. */
export interface MeetingContactOption {
  id: string
  name: string
  company: string | null
}

/**
 * Návrh kontaktu pro schůzku z Macu: kontakty u událostí v kalendáři, které se
 * časem kryjí se schůzkou (±15 min), přes Hovory, zakázku, konzultaci nebo
 * e-mail pozvánky. Sloučený kontakt se ukáže jako ten, do kterého patří.
 */
export async function meetingContactSuggestions(id: string, deviceId: string): Promise<MeetingContactOption[]> {
  const rows = await adminDb<{ id: string; name: string; company: string | null }>`
    SELECT c.id::text AS id, c.display_name AS name, c.company
    FROM voice_meetings m
    JOIN calendar_events e
      ON e.starts_at < coalesce(m.ended_at, now()) + interval '15 minutes'
     AND e.ends_at > m.started_at - interval '15 minutes'
    LEFT JOIN client_leads l ON l.id = e.lead_id
    LEFT JOIN projects p ON p.id = e.project_id
    LEFT JOIN consultation_slots s ON s.id = e.consultation_slot_id
    JOIN contacts c0
      ON c0.id IN (l.contact_id, p.contact_id, s.contact_id)
      OR (e.invite_to IS NOT NULL AND lower(c0.email) = lower(e.invite_to))
    JOIN contacts c ON c.id = coalesce(c0.merged_into, c0.id)
    WHERE m.id = ${id} AND m.device_id = ${deviceId} AND c.merged_into IS NULL
    GROUP BY c.id, c.display_name, c.company
    ORDER BY min(abs(extract(epoch FROM e.starts_at - m.started_at))), c.display_name
    LIMIT 3
  `
  return rows.map((r) => ({ id: String(r.id), name: String(r.name), company: r.company ?? null }))
}

/** Hledání kontaktu z Macu (jméno, firma, e-mail, telefon); vrací jen jméno a firmu. */
export async function searchMeetingContacts(query: string): Promise<MeetingContactOption[]> {
  const found = await suggestContacts(query, 8)
  return found.map((c) => ({ id: c.id, name: c.name, company: c.company }))
}

/**
 * Přiřadí schůzku tohoto zařízení ke kontaktu (Mac). Sloučený kontakt se
 * nahradí tím, do kterého patří. `null` = odpojit.
 */
export async function setDeviceMeetingContact(
  id: string,
  deviceId: string,
  contactId: string | null,
): Promise<'ok' | 'no-meeting' | 'no-contact'> {
  if (contactId === null) {
    const rows = await adminDb<{ id: string }>`
      UPDATE voice_meetings SET contact_id = NULL, updated_at = now()
      WHERE id = ${id} AND device_id = ${deviceId} RETURNING id
    `
    return rows.length ? 'ok' : 'no-meeting'
  }
  const rows = await adminDb<{ id: string }>`
    UPDATE voice_meetings m SET contact_id = c.root, updated_at = now()
    FROM (SELECT coalesce(merged_into, id) AS root FROM contacts WHERE id = ${contactId}) c
    WHERE m.id = ${id} AND m.device_id = ${deviceId}
    RETURNING m.id
  `
  if (rows.length) return 'ok'
  return (await meetingOwnedBy(id, deviceId)) ? 'no-contact' : 'no-meeting'
}
