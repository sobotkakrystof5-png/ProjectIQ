'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { assertWritable } from '@/lib/ws/billing'
import * as bookings from '@/lib/ws/bookings'
import type { BookingError, BookingResult } from '@/lib/ws/bookings'
import { requireBusiness, requireWorkspace, type WsBusiness, type WsContext } from '@/lib/ws/context'
import * as mail from '@/lib/ws/email/notify'
import { findCustomersForBooking, type CustomerOption } from '@/lib/ws/calendar'
import { stampJob } from '@/lib/ws/loyalty'
import { fail, ok, type Result } from '@/lib/ws/result'
import { refreshSegmentsFor } from '@/lib/ws/segments'
import { getSlotAdvice } from '@/lib/ws/slot-advice'
import { toAdviceDto, type AdviceDto } from '@/lib/ws/slot-suggest'
import { addDays, formatDayShort, formatMinutes, isIsoDate, pragueParts, pragueToday, pragueToUtc } from '@/lib/ws/time'

// Akce poptávek, kalendáře a zakázek (S10). Každá: requireWorkspace →
// Zod → byznys z URL ověřený proti účtu → assertWritable (bez předplatného
// jen čtení) → jeden zápis v transakci (lib/ws/bookings.ts). Kolizi termínů
// rozhodne DB, tady se jen převede na českou větu. E-mail zákazníkovi (S15)
// jde až po úspěšném zápisu a jeho chyba akci nezruší (lib/ws/email/notify.ts).

const MESSAGES: Record<BookingError, string> = {
  overlap: 'Tenhle čas už je obsazený. Vyberte prosím jiný.',
  already_handled: 'Tuhle poptávku už někdo vyřídil. Obnovte prosím stránku.',
  not_found: 'Tenhle záznam už tu není. Obnovte prosím stránku.',
  needs_time: 'Vyberte prosím den a čas termínu.',
  invalid_staff: 'Vybraný pracovník tu není. Vyberte prosím jiného.',
  invalid_customer: 'Zákazník se nenašel. Vyberte ho prosím znovu.',
  bad_length: 'Termín může trvat nejméně 15 minut a nejvýš 12 hodin.',
}

const BAD_INPUT = 'Něco v údajích nesedí. Zkontrolujte je prosím.'
const FAILED = 'Nepodařilo se uložit. Zkuste to prosím znovu.'

const slug = z.string().min(1).max(60).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
const uuid = z.string().uuid()
const day = z.string().refine((v) => isIsoDate(v) && v >= '2020-01-01' && v <= '2100-12-31')
const minutes = z.number().int().min(0).max(1439)
const when = z.object({ day, minutes })
const optionalUuid = uuid.nullable().optional()

type Ctx = { ctx: WsContext; business: WsBusiness }

/** Společný začátek: přihlášení, vstup, byznys, předplatné. */
async function prepare<T extends { slug: string }>(
  schema: z.ZodType<T>,
  raw: unknown,
): Promise<{ ok: true; input: T; c: Ctx } | { ok: false; error: string }> {
  const ctx = await requireWorkspace()
  const parsed = schema.safeParse(raw)
  if (!parsed.success) return fail(BAD_INPUT)
  const business = await requireBusiness(ctx, parsed.data.slug)
  const blocked = await assertWritable(ctx)
  if (blocked) return blocked
  return { ok: true, input: parsed.data, c: { ctx, business } }
}

async function run<T, R>(
  name: string,
  c: Ctx,
  op: () => Promise<BookingResult<T>>,
  map: (data: T) => R,
): Promise<Result<R>> {
  try {
    const res = await op()
    if (!res.ok) return fail(MESSAGES[res.reason])
    revalidatePath(`/w/${c.business.slug}`, 'layout')
    return ok(map(res.data))
  } catch (e) {
    console.error(name, { accountId: c.ctx.accountId, error: e instanceof Error ? e.message : 'unknown' })
    return fail(FAILED)
  }
}

const toUtc = (w: { day: string; minutes: number }) => pragueToUtc(w.day, w.minutes)
const toWhen = (d: Date) => pragueParts(d)
const label = (d: Date) => {
  const p = pragueParts(d)
  return `${formatDayShort(p.date)} v ${formatMinutes(p.minutes)}`
}

// --- Poptávky ---------------------------------------------------------------

const confirmSchema = z.object({ slug, requestId: uuid, at: when.nullable().optional(), staffId: optionalUuid })

/** Potvrdit poptávku na chtěný čas (jeden klik), nebo na `at` (Jiný čas). */
export async function confirmRequest(raw: unknown): Promise<Result<{ message: string }>> {
  const p = await prepare(confirmSchema, raw)
  if (!p.ok) return p
  const { input, c } = p
  let appointmentId: string | null = null
  const res = await run(
    'confirmRequest',
    c,
    () =>
      bookings.confirmRequest(c.ctx, c.business, {
        requestId: input.requestId,
        start: input.at ? toUtc(input.at) : null,
        staffId: input.staffId ?? null,
      }),
    (r) => {
      appointmentId = r.appointmentId
      return { message: r.start ? `Potvrzeno na ${label(r.start)}.` : 'Poptávka je přijatá.' }
    },
  )
  if (res.ok) {
    // Nový zákazník se hned objeví mezi Novými (skupiny, S12).
    await refreshSegmentsFor(c.ctx, c.business, { requestId: input.requestId })
    if (appointmentId) {
      const changed = Boolean(input.at) && (await bookings.requestStatus(c.ctx, c.business, input.requestId)) === 'rescheduled'
      await mail.notifyBookingConfirmed(c.ctx, c.business.id, appointmentId, { changed })
      await mail.deliver(c.ctx)
    }
  }
  return res
}

const requestSchema = z.object({ slug, requestId: uuid })

/** Odmítnout hned, „Zpět“ v toastu volá reopenRequest. */
export async function declineRequest(raw: unknown): Promise<Result<null>> {
  const p = await prepare(requestSchema, raw)
  if (!p.ok) return p
  const res = await run('declineRequest', p.c, () => bookings.declineRequest(p.c.ctx, p.c.business, p.input.requestId), () => null)
  // E-mail odejde až po uplynutí „Zpět“; reopenRequest ho zruší.
  if (res.ok) await mail.notifyRequestDeclined(p.c.ctx, p.c.business.id, p.input.requestId)
  return res
}

export async function reopenRequest(raw: unknown): Promise<Result<null>> {
  const p = await prepare(requestSchema, raw)
  if (!p.ok) return p
  const res = await run('reopenRequest', p.c, () => bookings.reopenRequest(p.c.ctx, p.c.business, p.input.requestId), () => null)
  if (res.ok) await mail.cancelPendingNotice(p.c.ctx, `declined:${p.input.requestId}`)
  return res
}

// --- Termíny ----------------------------------------------------------------

const bookingSchema = z
  .object({
    slug,
    customerId: optionalUuid,
    name: z.string().trim().max(120).optional(),
    phone: z.string().trim().max(30).optional(),
    email: z.string().trim().toLowerCase().max(200).optional(),
    serviceId: optionalUuid,
    staffId: optionalUuid,
    at: when,
    /** Délka z rychlého zadání (tažením v mřížce); bez ní platí délka služby. */
    durationMin: z.number().int().min(15).max(720).nullable().optional(),
    note: z.string().trim().max(1000).optional(),
  })
  .refine((v) => v.customerId || v.name, { path: ['name'] })

/** Nová rezervace z panelu. Zákazník se najde podle telefonu/e-mailu, nebo založí. */
export async function createManualBooking(raw: unknown): Promise<Result<{ message: string; appointmentId: string }>> {
  const p = await prepare(bookingSchema, raw)
  if (!p.ok) return p.error === BAD_INPUT ? fail('Vyplňte prosím jméno, den a čas.') : p
  const { input, c } = p

  const phone = input.phone ? bookings.normalizePhone(input.phone) : null
  if (input.phone && !phone) return fail('Telefon nevypadá správně. Zkontrolujte ho prosím.')
  const email = input.email || null
  if (email && !z.string().email().safeParse(email).success) return fail('E-mail nevypadá správně. Zkontrolujte ho prosím.')

  const res = await run(
    'createManualBooking',
    c,
    () =>
      bookings.createBooking(c.ctx, c.business, {
        customerId: input.customerId ?? null,
        customer: input.customerId ? null : { name: input.name!, phone, email },
        serviceId: input.serviceId ?? null,
        staffId: input.staffId ?? null,
        start: toUtc(input.at),
        durationMin: input.durationMin ?? null,
        note: input.note || null,
      }),
    (r) => ({ message: `Rezervace je uložená na ${label(toUtc(input.at))}.`, appointmentId: r.appointmentId }),
  )
  if (res.ok) {
    await refreshSegmentsFor(c.ctx, c.business, { appointmentId: res.data.appointmentId })
    await mail.notifyBookingConfirmed(c.ctx, c.business.id, res.data.appointmentId)
    await mail.deliver(c.ctx)
  }
  return res
}

const moveSchema = z.object({ slug, appointmentId: uuid, at: when, staffId: optionalUuid })

/** Přesun termínu (přetažení v kalendáři nebo formulář v detailu). Vrací předchozí místo pro „Zpět“. */
export async function moveAppointment(
  raw: unknown,
): Promise<Result<{ message: string; prev: { day: string; minutes: number; staffId: string | null } }>> {
  const p = await prepare(moveSchema, raw)
  if (!p.ok) return p
  const { input, c } = p
  let prevStart: Date | null = null
  const res = await run(
    'moveAppointment',
    c,
    () =>
      bookings.moveAppointment(c.ctx, c.business, {
        appointmentId: input.appointmentId,
        start: toUtc(input.at),
        staffId: input.staffId ?? null,
      }),
    (r) => {
      prevStart = r.prevStart
      const prev = toWhen(r.prevStart)
      return {
        message: `Přesunuto na ${label(r.start)}.`,
        prev: { day: prev.date, minutes: prev.minutes, staffId: r.prevStaffId },
      }
    },
  )
  // Zákazník dostane e-mail po chvíli; „Zpět“ (přesun zpátky) ho zruší.
  if (res.ok && prevStart) await mail.notifyAppointmentMoved(c.ctx, c.business.id, input.appointmentId, prevStart)
  return res
}

const resizeSchema = z.object({
  slug,
  appointmentId: uuid,
  durationMin: z.number().int().min(bookings.MIN_DURATION_MIN).max(bookings.MAX_DURATION_MIN),
})

const durationText = (min: number) =>
  min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}`

/**
 * Změna délky termínu (tažením za spodní okraj nebo výběrem v detailu).
 * Začátek zůstává, kolizi s dalším termínem rozhodne DB. Zákazník o změně
 * délky e-mail nedostane (čas začátku se nemění). Vrací předchozí délku pro „Zpět“.
 */
export async function resizeAppointment(raw: unknown): Promise<Result<{ message: string; prevDurationMin: number }>> {
  const p = await prepare(resizeSchema, raw)
  if (!p.ok) return p
  const { input, c } = p
  return run(
    'resizeAppointment',
    c,
    () => bookings.resizeAppointment(c.ctx, c.business, { appointmentId: input.appointmentId, durationMin: input.durationMin }),
    (r) => ({ message: `Termín trvá ${durationText(input.durationMin)}.`, prevDurationMin: r.prevDurationMin }),
  )
}

const appointmentSchema = z.object({ slug, appointmentId: uuid })

/** Zrušit hned, „Zpět“ v toastu volá restoreAppointment. */
export async function cancelAppointment(raw: unknown): Promise<Result<null>> {
  const p = await prepare(appointmentSchema, raw)
  if (!p.ok) return p
  const res = await run('cancelAppointment', p.c, () => bookings.cancelAppointment(p.c.ctx, p.c.business, p.input.appointmentId), () => null)
  if (res.ok) await mail.notifyAppointmentCancelled(p.c.ctx, p.c.business.id, p.input.appointmentId)
  return res
}

export async function restoreAppointment(raw: unknown): Promise<Result<null>> {
  const p = await prepare(appointmentSchema, raw)
  if (!p.ok) return p
  const res = await run('restoreAppointment', p.c, () => bookings.restoreAppointment(p.c.ctx, p.c.business, p.input.appointmentId), () => null)
  if (res.ok) await mail.cancelPendingNotice(p.c.ctx, `cancelled:${p.input.appointmentId}`)
  return res
}

const blockSchema = z
  .object({
    slug,
    staffId: optionalUuid,
    from: when,
    to: when,
    allDay: z.boolean().optional(),
    title: z.string().trim().min(1).max(80),
  })
  .refine((v) => (v.allDay ? v.to.day >= v.from.day : `${v.to.day}-${v.to.minutes}` !== `${v.from.day}-${v.from.minutes}`))

/** Blokace (dovolená, školení). Celý den = od půlnoci prvního do půlnoci po posledním dni. */
export async function createBlock(raw: unknown): Promise<Result<{ message: string; appointmentId: string }>> {
  const p = await prepare(blockSchema, raw)
  if (!p.ok) return p.error === BAD_INPUT ? fail('Zkontrolujte prosím, od kdy do kdy blokace platí, a napište důvod.') : p
  const { input, c } = p
  const start = input.allDay ? pragueToUtc(input.from.day, 0) : toUtc(input.from)
  const end = input.allDay ? pragueToUtc(addDays(input.to.day, 1), 0) : toUtc(input.to)
  if (end <= start) return fail('Konec blokace musí být až po začátku.')
  if (end.getTime() - start.getTime() > 366 * 86_400_000) return fail('Blokace může trvat nejdéle rok.')
  return run(
    'createBlock',
    c,
    () => bookings.createBlock(c.ctx, c.business, { staffId: input.staffId ?? null, start, end, title: input.title }),
    (r) => ({ message: 'Blokace je v kalendáři.', appointmentId: r.appointmentId }),
  )
}

// --- Rady k času a hledání (čtení; funguje i při pozastaveném předplatném) -----

const adviceSchema = z.object({
  slug,
  at: when.nullable().optional(),
  durationMin: z.number().int().min(5).max(720).nullable().optional(),
  serviceId: optionalUuid,
  staffId: optionalUuid,
  excludeAppointmentId: optionalUuid,
  count: z.number().int().min(1).max(8).optional(),
})

/**
 * Je čas volný, je v otevírací době a které volné časy jsou nejblíž?
 * Rychlé zadání, Jiný čas u poptávky i „Najít volný čas“ ptají na jedno
 * místo, takže pravidlo je všude stejné jako u objednávky na webu.
 */
export async function slotAdvice(raw: unknown): Promise<Result<AdviceDto>> {
  const ctx = await requireWorkspace()
  const parsed = adviceSchema.safeParse(raw)
  if (!parsed.success) return fail(BAD_INPUT)
  const business = await requireBusiness(ctx, parsed.data.slug)
  const i = parsed.data
  try {
    const advice = await getSlotAdvice(ctx, business, {
      start: i.at ? toUtc(i.at) : null,
      durationMin: i.durationMin ?? null,
      serviceId: i.serviceId ?? null,
      staffId: i.staffId ?? null,
      excludeAppointmentId: i.excludeAppointmentId ?? null,
      count: i.count,
    })
    return ok(toAdviceDto(advice, pragueToday()))
  } catch (e) {
    console.error('slotAdvice', { accountId: ctx.accountId, error: e instanceof Error ? e.message : 'unknown' })
    return fail('Volné časy se nepodařilo načíst. Zkuste to prosím znovu.')
  }
}

const customerSearchSchema = z.object({ slug, query: z.string().trim().max(80) })

/** Hledání zákazníka v rychlém zadání rezervace (jméno, telefon, e-mail). */
export async function searchCustomers(raw: unknown): Promise<Result<CustomerOption[]>> {
  const ctx = await requireWorkspace()
  const parsed = customerSearchSchema.safeParse(raw)
  if (!parsed.success) return fail('Hledaný text je moc dlouhý. Zkraťte ho prosím.')
  await requireBusiness(ctx, parsed.data.slug)
  try {
    return ok(await findCustomersForBooking(ctx, parsed.data.query))
  } catch (e) {
    console.error('searchCustomers', { accountId: ctx.accountId, error: e instanceof Error ? e.message : 'unknown' })
    return fail('Hledání se nepovedlo. Zkuste to prosím znovu.')
  }
}

// --- Zakázky ----------------------------------------------------------------

const stageSchema = z.object({ slug, jobId: uuid, stageId: uuid })

/** Přesun zakázky mezi stavy na tabuli. Vrací předchozí stav pro „Zpět“. */
export async function moveJobStage(raw: unknown): Promise<Result<{ prevStageId: string | null }>> {
  const p = await prepare(stageSchema, raw)
  if (!p.ok) return p
  const { input, c } = p
  const res = await run('moveJobStage', c, () => bookings.setJobStage(c.ctx, c.business, input), (r) => r)
  if (res.ok) {
    // Hotová zakázka: razítko (program „dokončená zakázka“) a přepočet skupiny.
    // Selhání nesmí vrátit přesun, který už proběhl.
    try {
      const stamp = await stampJob(c.ctx, c.business, input.jobId)
      if (stamp?.result === 'added' && stamp.full) {
        await mail.notifyRewardForJob(c.ctx, c.business.id, input.jobId)
        await mail.deliver(c.ctx)
      }
    } catch (e) {
      console.error('moveJobStage.stamp', { accountId: c.ctx.accountId, error: e instanceof Error ? e.message : 'unknown' })
    }
    await refreshSegmentsFor(c.ctx, c.business, { jobId: input.jobId })
  }
  return res
}
