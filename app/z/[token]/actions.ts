'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { orderSlots } from '@/lib/ws/intake/schema'
import { clientIp, hitLimit, LIMITS } from '@/lib/ws/intake/rate-limit'
import { portalCancel, portalMove, portalReview, portalSlots, resolvePortal, type PortalFailure, type PortalRef } from '@/lib/ws/portal'
import { isIsoDate } from '@/lib/ws/time'

// Akce klientského portálu /z/[token] (S16, R-051). Bez přihlášení: oprávnění
// dává jen token z URL (náhodný, generuje DB). Účet ani byznys se z formuláře
// nikdy nečtou — zjistí je resolvePortal. Zod, rate limit na IP i na záznam,
// chyby česky bez technických slov.

const token = z.string().uuid()

export type PortalActionResult = { ok: true } | { ok: false; error: string; slotTaken?: boolean }
export type PortalSlots = ReturnType<typeof orderSlots>

const BUSY = 'Zkuste to prosím za pár minut.'
const FAILED = 'Nepodařilo se to uložit. Zkuste to prosím znovu.'
const GONE = 'Tenhle odkaz už neplatí.'

const MESSAGES: Record<PortalFailure, string> = {
  not_allowed: 'Tohle už tady změnit nejde. Napište prosím přímo firmě.',
  taken: 'Tenhle čas mezitím někdo obsadil. Vyberte prosím jiný.',
  not_found: GONE,
  duplicate: 'Hodnocení už máme. Děkujeme.',
}

/** Rate limit + token → záznam. Řetězec = chybová hláška pro zákazníka. */
async function guard(raw: string): Promise<PortalRef | string> {
  if (await hitLimit(LIMITS.portalActionPerIp, clientIp(headers()))) return BUSY
  const ref = await resolvePortal(raw)
  if (!ref) return GONE
  if (await hitLimit(LIMITS.portalActionPerItem, ref.id)) return BUSY
  return ref
}

function logError(action: string, e: unknown) {
  console.error(`ws.portal.${action}`, { error: e instanceof Error ? e.message : 'unknown' })
}

export async function getMoveSlots(raw: unknown): Promise<{ ok: true; slots: PortalSlots } | { ok: false; error: string }> {
  const parsed = z.object({ token }).safeParse(raw)
  if (!parsed.success) return { ok: false, error: GONE }
  try {
    // Výpis volných časů nic nemění — stačí limit na IP jako u objednávací stránky.
    if (await hitLimit(LIMITS.schemaPerIp, clientIp(headers()))) return { ok: false, error: BUSY }
    const ref = await resolvePortal(parsed.data.token)
    if (!ref) return { ok: false, error: GONE }
    const slots = await portalSlots(ref)
    if (!slots) return { ok: false, error: MESSAGES.not_allowed }
    return { ok: true, slots: orderSlots(slots) }
  } catch (e) {
    logError('slots', e)
    return { ok: false, error: 'Volné časy se nepodařilo načíst. Zkuste to prosím znovu.' }
  }
}

export async function moveVisit(raw: unknown): Promise<PortalActionResult> {
  const parsed = z
    .object({ token, day: z.string().refine(isIsoDate), minutes: z.number().int().min(0).max(1439) })
    .safeParse(raw)
  if (!parsed.success) return { ok: false, error: 'Vyberte prosím den a čas.' }
  try {
    const ref = await guard(parsed.data.token)
    if (typeof ref === 'string') return { ok: false, error: ref }
    const r = await portalMove(ref, parsed.data.day, parsed.data.minutes)
    revalidatePath(`/z/${parsed.data.token}`)
    return r.ok ? { ok: true } : { ok: false, error: MESSAGES[r.reason], slotTaken: r.reason === 'taken' }
  } catch (e) {
    logError('move', e)
    return { ok: false, error: FAILED }
  }
}

export async function cancelVisit(raw: unknown): Promise<PortalActionResult> {
  const parsed = z.object({ token }).safeParse(raw)
  if (!parsed.success) return { ok: false, error: GONE }
  try {
    const ref = await guard(parsed.data.token)
    if (typeof ref === 'string') return { ok: false, error: ref }
    const r = await portalCancel(ref)
    revalidatePath(`/z/${parsed.data.token}`)
    return r.ok ? { ok: true } : { ok: false, error: MESSAGES[r.reason] }
  } catch (e) {
    logError('cancel', e)
    return { ok: false, error: FAILED }
  }
}

export async function sendReview(raw: unknown): Promise<PortalActionResult> {
  const parsed = z
    .object({
      token,
      score: z.number().int().min(1).max(10),
      comment: z.string().max(1000, 'Komentář je moc dlouhý, zkraťte ho prosím.'),
      // past na roboty: skryté pole, člověk ho nevyplní
      website: z.string().max(500),
    })
    .safeParse(raw)
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message
    return { ok: false, error: msg?.includes('dlouhý') ? msg : 'Vyberte prosím číslo od 1 do 10.' }
  }
  // Robot: tvářit se, že je hotovo, a nic neukládat.
  if (parsed.data.website.trim()) return { ok: true }
  try {
    const ref = await guard(parsed.data.token)
    if (typeof ref === 'string') return { ok: false, error: ref }
    const comment = parsed.data.comment.trim() || null
    const r = await portalReview(ref, parsed.data.score, comment)
    revalidatePath(`/z/${parsed.data.token}`)
    return r.ok ? { ok: true } : { ok: false, error: MESSAGES[r.reason] }
  } catch (e) {
    logError('review', e)
    return { ok: false, error: FAILED }
  }
}
