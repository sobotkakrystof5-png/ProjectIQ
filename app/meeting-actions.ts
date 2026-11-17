'use server'

import { after } from 'next/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import {
  INVITE_DELAY_MS,
  cancelMeeting,
  retryInvite,
  scheduleOutreachMeeting,
  sendDueInvite,
  type ScheduleResult,
} from '@/lib/admin/meetings'
import { disconnectGoogle } from '@/lib/admin/google/oauth'
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
