'use server'

import { after } from 'next/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import { pragueWallClockToISO } from '@/lib/prague-time'
import {
  ingestMeetingNote,
  linkMeetingContact,
  resetMeetingAi,
  setMeetingHidden,
  unlinkMeetingContact,
  type ContactSource,
} from '@/lib/admin/meeting-notes/store'
import { confirmMeetingClient, draftMeetingEmail, processMeetingNote, type DraftResult } from '@/lib/admin/meeting-notes/process'
import { MAX_TRANSCRIPT_CHARS } from '@/types/meeting-notes'

/**
 * Schůzky a přepisy (R-144). Výsledek je vždy `{ ok, … }`, nikdy výjimka do UI.
 * Žádná akce nic neodesílá: e-mail je jen koncept v Gmailu.
 */

const uuid = z.string().uuid()

function refresh(id?: string) {
  revalidatePath('/dashboard/schuzky')
  if (id) revalidatePath(`/dashboard/schuzky/${id}`)
}

function runLater(id: string) {
  after(async () => {
    await processMeetingNote(id).catch((err: unknown) => {
      console.error('[schuzky] zpracování selhalo:', err instanceof Error ? err.message : 'unknown')
    })
  })
}

const manualSchema = z.object({
  title: z.string().trim().max(200).optional().default(''),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  minutes: z.coerce.number().int().min(1).max(600).optional(),
  transcript: z.string().max(MAX_TRANSCRIPT_CHARS),
})

export type ManualNoteResult = { ok: true; id: string } | { ok: false; error: string }

/**
 * Ruční vložení přepisu („Copy as Markdown" z Wispr Flow nebo přepis odjinud).
 * Text se uloží přesně, jak přišel; prázdný nebo jen mezery se odmítne.
 */
export async function addManualMeetingNote(input: z.input<typeof manualSchema>): Promise<ManualNoteResult> {
  await requireAuth()
  const parsed = manualSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Vyplňte den, čas a přepis.' }
  const { title, date, time, minutes, transcript } = parsed.data
  if (transcript.trim().length < 20) return { ok: false, error: 'Přepis je moc krátký. Vložte celý text schůzky.' }

  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  const startedAt = pragueWallClockToISO(y, m, d, hh, mm)
  const endedAt = minutes ? new Date(new Date(startedAt).getTime() + minutes * 60_000).toISOString() : null

  try {
    const result = await ingestMeetingNote({
      source: 'manual',
      sourceId: null,
      title: title || null,
      startedAt,
      endedAt,
      shareLink: null,
      participants: [],
      sourceSummary: null,
      transcript,
      declaredChars: null,
    })
    runLater(result.id)
    refresh(result.id)
    return { ok: true, id: result.id }
  } catch (err) {
    if ((err as { code?: string })?.code === '42P01') return { ok: false, error: 'Databáze ještě nemá tabulku schůzek (migrace 134).' }
    console.error('[schuzky] ruční uložení selhalo:', err instanceof Error ? err.message : 'unknown')
    return { ok: false, error: 'Přepis se nepodařilo uložit.' }
  }
}

export type ConfirmClientResult =
  | { ok: true; contactId: string; filled: string[]; draft: DraftResult }
  | { ok: false; error: string }

/** Potvrdit klienta: vybraný kontakt (`contactId`), nebo nový z údajů v přepisu (`null`). */
export async function confirmClient(noteId: string, contactId: string | null): Promise<ConfirmClientResult> {
  await requireAuth()
  if (!uuid.safeParse(noteId).success || (contactId !== null && !uuid.safeParse(contactId).success)) {
    return { ok: false, error: 'Neplatný požadavek.' }
  }
  const result = await confirmMeetingClient(noteId, contactId)
  refresh(noteId)
  if (result.ok) revalidatePath(`/dashboard/kontakty/${result.contactId}`)
  return result
}

export type UnlinkResult = { ok: true; previous: { contactId: string | null; source: ContactSource | null } } | { ok: false; error: string }

/** „Není to on": zruší přiřazení. Zpět vrátí původní kontakt. */
export async function unlinkClient(noteId: string): Promise<UnlinkResult> {
  await requireAuth()
  if (!uuid.safeParse(noteId).success) return { ok: false, error: 'Neplatný požadavek.' }
  const previous = await unlinkMeetingContact(noteId)
  refresh(noteId)
  return previous === null ? { ok: false, error: 'Schůzka neexistuje.' } : { ok: true, previous }
}

export async function relinkClient(noteId: string, contactId: string, source: ContactSource): Promise<{ ok: boolean }> {
  await requireAuth()
  if (!uuid.safeParse(noteId).success || !uuid.safeParse(contactId).success) return { ok: false }
  const allowed: ContactSource[] = ['email', 'telefon', 'kalendar', 'potvrzeno']
  const ok = await linkMeetingContact(noteId, contactId, allowed.includes(source) ? source : 'potvrzeno')
  refresh(noteId)
  return { ok }
}

export async function hideNote(noteId: string, hidden: boolean): Promise<{ ok: boolean }> {
  await requireAuth()
  if (!uuid.safeParse(noteId).success) return { ok: false }
  const ok = await setMeetingHidden(noteId, hidden)
  refresh(noteId)
  return { ok }
}

export async function reprocessNote(noteId: string): Promise<{ ok: boolean }> {
  await requireAuth()
  if (!uuid.safeParse(noteId).success) return { ok: false }
  const ok = await resetMeetingAi(noteId)
  if (ok) runLater(noteId)
  refresh(noteId)
  return { ok }
}

/** Založit koncept v Gmailu znovu (po změně klienta nebo e-mailu). Starý koncept se smaže. */
export async function redraftEmail(noteId: string): Promise<DraftResult> {
  await requireAuth()
  if (!uuid.safeParse(noteId).success) return { status: 'failed', reason: 'Neplatný požadavek.' }
  const result = await draftMeetingEmail(noteId)
  refresh(noteId)
  return result
}
