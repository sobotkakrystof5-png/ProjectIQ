'use server'

import { after } from 'next/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import {
  INVITE_DELAY_MS,
  applyMeetingSettings,
  cancelMeeting,
  convertEventToMeeting,
  recordArrangedMeeting,
  retryInvite,
  scheduleCalendarMeeting,
  scheduleOutreachMeeting,
  sendDueInvite,
  undoMeetingSetup,
  type ArrangedResult,
  type MeetingSetupResult,
  type ScheduleResult,
} from '@/lib/admin/meetings'
import { loadMeetingStatus, planReminders, remindersAvailable, TICK_STALE_MS, type MeetingStatus } from '@/lib/admin/meeting-reminders'
import { disconnectGoogle, googleStatus } from '@/lib/admin/google/oauth'
import { vizeonMailConfigured } from '@/lib/admin/vizeon-mail'
import { smsConfigured } from '@/lib/admin/sms'
import { adminDb } from '@/lib/admin/db'
import { normalizePhone } from '@/lib/contacts/normalize'
import { findPhoneByEmail, type FoundPhone } from '@/lib/admin/contact-phone'
import { pragueWallClockToISO } from '@/lib/prague-time'

/**
 * Schůzka s firmou od AI asistenta jedním klikem (R-112): Google Meet,
 * událost v kalendáři a e-mail klientovi z krystof@vizeon.cz. E-mail čeká
 * 15 s na „Zpět" (stejně jako dotazník, R-097) a pak odejde přes `after()`.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const scheduleSchema = z.object({
  outreachId: z.string().regex(UUID),
  // Pražský čas z formuláře; okamžik z něj spočítá server.
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Neplatné datum.'),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Neplatný čas.'),
  minutes: z.number().int().min(15).max(180),
  sendInvite: z.boolean(),
  inviteTo: z.string().trim().max(254).email('Neplatný e-mail klienta.').nullable(),
  subject: z
    .string()
    .trim()
    .min(1, 'Předmět je povinný.')
    .max(200)
    .refine((s) => !/[\r\n]/.test(s), 'Předmět musí být na jednom řádku.'),
  intro: z.string().trim().min(1, 'Text e-mailu je povinný.').max(4000),
  reminders: z.boolean().default(true),
})

function revalidate() {
  revalidatePath('/dashboard/calls')
  revalidatePath('/dashboard/ai-asistent')
  revalidatePath('/dashboard/calendar')
  revalidatePath('/dashboard')
}

export async function scheduleMeeting(raw: unknown): Promise<ScheduleResult> {
  await requireAuth()
  const parsed = scheduleSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Neplatné údaje.' }

  const { date, time, ...rest } = parsed.data
  const [y, m, d] = date.split('-').map(Number)
  const [h, min] = time.split(':').map(Number)
  const result = await scheduleOutreachMeeting({ ...rest, startsAt: pragueWallClockToISO(y, m, d, h, min) })
  if (result.ok) {
    revalidate()
    if (result.inviteQueued) {
      const id = result.eventId
      after(async () => {
        await new Promise((r) => setTimeout(r, INVITE_DELAY_MS + 500))
        await sendDueInvite(id)
      })
    }
  }
  return result
}

const arrangedSchema = z.object({
  outreachId: z.string().regex(UUID),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Neplatné datum.'),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Neplatný čas.'),
  minutes: z.number().int().min(15).max(180),
  note: z
    .string()
    .trim()
    .max(300, 'Poznámka je moc dlouhá.')
    .refine((s) => !/[\r\n]/.test(s), 'Poznámka musí být na jednom řádku.'),
})

/**
 * „Schůzka domluvena": termín domluvený s klientem jinde se jen zapíše do
 * kalendáře a Hovorů. Bez Google Meetu a bez e-mailu; „Zpět" je `undoMeeting`.
 */
export async function recordMeeting(raw: unknown): Promise<ArrangedResult> {
  await requireAuth()
  const parsed = arrangedSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Neplatné údaje.' }

  const { date, time, ...rest } = parsed.data
  const [y, m, d] = date.split('-').map(Number)
  const [h, min] = time.split(':').map(Number)
  const result = await recordArrangedMeeting({ ...rest, startsAt: pragueWallClockToISO(y, m, d, h, min) })
  if (result.ok) revalidate()
  return result
}

export async function undoMeeting(eventId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAuth()
  if (!UUID.test(eventId)) return { ok: false, error: 'Schůzka nenalezena.' }
  const result = await cancelMeeting(eventId)
  revalidate()
  return result
}

export async function resendMeetingInvite(eventId: string): Promise<{ ok: boolean; error?: string }> {
  await requireAuth()
  if (!UUID.test(eventId)) return { ok: false, error: 'Schůzka nenalezena.' }
  const status = await retryInvite(eventId)
  revalidate()
  return status === 'sent' ? { ok: true } : { ok: false, error: 'E-mail se nepodařilo odeslat.' }
}

export async function disconnectGoogleAccount(): Promise<void> {
  await requireAuth()
  await disconnectGoogle()
  revalidatePath('/dashboard/profil')
}

// ─── Schůzka přímo z kalendáře (R-137) ────────────────────────────────────────

export type MeetingReadiness = {
  /** Je v databázi migrace 128? Bez ní přepínač schůzky v kalendáři není. */
  available: boolean
  google: boolean
  mail: boolean
  sms: boolean
  /** Běží spouštěč připomínek? `null` = ještě nikdy neběžel. */
  trigger: boolean | null
}

export async function getMeetingReadiness(): Promise<MeetingReadiness> {
  await requireAuth()
  const [available, google] = await Promise.all([remindersAvailable(), googleStatus()])
  let trigger: boolean | null = null
  if (available) {
    const rows = await adminDb<{ tick: string | Date | null }>`SELECT reminders_tick_at AS tick FROM admin_settings WHERE id`
    const tick = rows[0]?.tick
    trigger = tick ? Date.now() - new Date(tick).getTime() < TICK_STALE_MS : null
  }
  return {
    available,
    google: google.configured && google.connected,
    mail: vizeonMailConfigured(),
    sms: smsConfigured(),
    trigger,
  }
}

/** Telefon klienta podle e-mailu z Kontaktů, Hovorů, zakázek a od asistenta. */
export async function findClientPhone(email: unknown): Promise<FoundPhone | null> {
  await requireAuth()
  const parsed = z.string().trim().max(254).email().safeParse(email)
  if (!parsed.success) return null
  return findPhoneByEmail(parsed.data)
}

const httpsUrl = z
  .string()
  .trim()
  .max(500)
  .url('Odkaz na ukázku musí být celá adresa, například https://…')
  .refine((u) => u.startsWith('https://'), 'Odkaz na ukázku musí začínat https://.')

const draftSchema = z.object({
  email: z.string().trim().max(254).email('Zadejte prosím e-mail klienta. Pošleme na něj pozvánku.'),
  phone: z.string().trim().max(40).nullable(),
  subject: z
    .string()
    .trim()
    .min(1, 'Předmět je povinný.')
    .max(200)
    .refine((v) => !/[\r\n]/.test(v), 'Předmět musí být na jednom řádku.'),
  intro: z.string().trim().min(1, 'Text pozvánky je povinný.').max(4000),
  demoUrl: httpsUrl.nullable(),
  reminders: z.boolean(),
})

type DraftParsed = z.infer<typeof draftSchema>

/** Telefon pro SMS v mezinárodním tvaru, nebo chyba pro formulář. */
function smsPhone(raw: string | null): { ok: true; phone: string | null } | { ok: false; error: string } {
  if (!raw?.trim()) return { ok: true, phone: null }
  const phone = normalizePhone(raw)
  return phone ? { ok: true, phone } : { ok: false, error: 'Telefon nejde přečíst. Zkontrolujte ho prosím i s předvolbou.' }
}

function queueInvite(eventId: string) {
  after(async () => {
    await new Promise((r) => setTimeout(r, INVITE_DELAY_MS + 500))
    await sendDueInvite(eventId)
  })
}

const isoTime = z.string().max(40).refine((v) => !Number.isNaN(Date.parse(v)), 'Neplatný čas.')

const calendarMeetingSchema = z.object({
  title: z.string().trim().min(1, 'Název je povinný.').max(120, 'Název může mít nejvýš 120 znaků.'),
  description: z.string().trim().max(500).nullable(),
  startsAt: isoTime,
  endsAt: isoTime,
  contactName: z.string().trim().max(120).nullable(),
  draft: draftSchema,
})

function draftOf(d: DraftParsed, phone: string | null) {
  return {
    email: d.email,
    phone,
    subject: d.subject,
    intro: d.intro,
    demoUrl: d.demoUrl || null,
    reminders: d.reminders,
  }
}

/** Nová událost rovnou jako schůzka: Meet, pozvánka za 15 s, připomínky. */
export async function createCalendarMeeting(raw: unknown): Promise<MeetingSetupResult> {
  await requireAuth()
  const parsed = calendarMeetingSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Neplatné údaje.' }
  const v = parsed.data
  const phone = smsPhone(v.draft.phone)
  if (!phone.ok) return phone

  const result = await scheduleCalendarMeeting({
    ...draftOf(v.draft, phone.phone),
    title: v.title,
    description: v.description || null,
    startsAt: new Date(v.startsAt).toISOString(),
    endsAt: new Date(v.endsAt).toISOString(),
    contactName: v.contactName || null,
    phoneRaw: v.draft.phone?.trim() || null,
  })
  if (result.ok) {
    revalidate()
    queueInvite(result.eventId)
  }
  return result
}

/** Existující událost se stane schůzkou. */
export async function makeEventMeeting(raw: unknown): Promise<MeetingSetupResult> {
  await requireAuth()
  const parsed = z.object({ eventId: z.string().regex(UUID), draft: draftSchema }).safeParse(raw)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Neplatné údaje.' }
  const phone = smsPhone(parsed.data.draft.phone)
  if (!phone.ok) return phone
  const result = await convertEventToMeeting(parsed.data.eventId, draftOf(parsed.data.draft, phone.phone))
  if (result.ok) {
    revalidate()
    queueInvite(result.eventId)
  }
  return result
}

/** U existující schůzky: kam posílat připomínky a jestli vůbec. */
export async function saveMeetingSettings(raw: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAuth()
  const parsed = z
    .object({
      eventId: z.string().regex(UUID),
      email: z.string().trim().max(254).email('Zadejte prosím e-mail klienta.').nullable(),
      phone: z.string().trim().max(40).nullable(),
      reminders: z.boolean(),
    })
    .safeParse(raw)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Neplatné údaje.' }
  const phone = smsPhone(parsed.data.phone)
  if (!phone.ok) return phone
  await applyMeetingSettings(parsed.data.eventId, {
    phone: phone.phone,
    remindersOn: parsed.data.reminders,
    email: parsed.data.email,
  })
  await planReminders(parsed.data.eventId)
  revalidate()
  return { ok: true }
}

/** „Zpět" u schůzky z kalendáře, dokud pozvánka neodešla. */
export async function undoCalendarMeeting(
  eventId: string,
  mode: 'delete' | 'revert',
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAuth()
  if (!UUID.test(eventId) || (mode !== 'delete' && mode !== 'revert')) return { ok: false, error: 'Schůzka nenalezena.' }
  const result = await undoMeetingSetup(eventId, mode)
  revalidate()
  return result
}

/** Stav připomínek pro detail události v kalendáři. */
export async function getMeetingStatus(eventId: string): Promise<MeetingStatus | null> {
  await requireAuth()
  if (!UUID.test(eventId)) return null
  return loadMeetingStatus(eventId)
}
