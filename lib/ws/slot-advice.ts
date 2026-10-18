import 'server-only'
import { checkSlot, type SlotCheck } from './bookings'
import type { WsBusiness, WsContext } from './context'
import { q, wsDb, type WsRow } from './db'
import { BOOKING, loadIntakeConfig, loadSlotData } from './intake/intake'
import { computeSlots, isWithinHours } from './intake/slots'
import { pickNearestSlots, type SuggestedSlot } from './slot-suggest'
import { addDays, pragueParts, pragueToday, pragueToUtc } from './time'

// Rady k času v kalendáři majitele (RD05): je termín volný, vejde se do
// otevírací doby a které tři nejbližší časy jsou volné. Volné časy počítá
// stejná funkce jako objednávka (computeSlots) — jedna logika, jen bez
// předstihu (majitel může zapsat i hned) a s časem, který se hledá kolem
// zadaného termínu.

type Biz = Pick<WsBusiness, 'id' | 'name'>

export type SlotAdvice = {
  /** Volno / kolize pro zadaný čas; `null`, když čas zadaný není. */
  check: SlotCheck | null
  /** Čas je mimo otevírací dobu (jen upozornění, zapsat jde dál). */
  outsideHours: boolean
  /** Byznys má nastavenou otevírací dobu (bez ní návrhy časů nejdou). */
  hoursSet: boolean
  /** Nejbližší volné časy, chronologicky. */
  suggestions: SuggestedSlot[]
}

export const EMPTY_ADVICE: SlotAdvice = { check: null, outsideHours: false, hoursSet: false, suggestions: [] }

export type AdviceInput = {
  /** Zadaný čas; `null` = hledá se nejbližší volno od teď. */
  start: Date | null
  /** Délka v minutách; bez ní se vezme délka služby (nebo 60). */
  durationMin: number | null
  serviceId: string | null
  staffId: string | null
  /** Přesouvaný termín nekoliduje sám se sebou. */
  excludeAppointmentId?: string | null
  count?: number
  now?: Date
}

const SEARCH_DAYS = 14

export async function getSlotAdvice(ctx: WsContext, business: Biz, input: AdviceInput): Promise<SlotAdvice> {
  const now = input.now ?? new Date()
  const count = input.count ?? 3
  const config = await loadIntakeConfig(ctx.accountId, business.id)
  if (!config) return EMPTY_ADVICE

  // Služba z tohoto byznysu (i skrytá na webu): délka a rozestup za ní.
  let duration = input.durationMin ?? 60
  let buffer = 0
  let serviceId: string | null = null
  if (input.serviceId) {
    const [rows] = await wsDb(ctx).batch([
      q`SELECT id, duration_min, buffer_min FROM ws.services
        WHERE account_id = ${ctx.accountId} AND business_id = ${business.id} AND id = ${input.serviceId}::uuid`,
    ])
    const svc = (rows as WsRow[])[0]
    if (svc) {
      serviceId = String(svc.id)
      if (input.durationMin === null) duration = Number(svc.duration_min)
      buffer = Number(svc.buffer_min ?? 0)
    }
  }

  const check = input.start
    ? await checkSlot(ctx, business, {
        start: input.start,
        end: new Date(input.start.getTime() + duration * 60_000),
        serviceId,
        excludeAppointmentId: input.excludeAppointmentId ?? null,
        staffId: input.staffId,
      })
    : null

  const hoursSet = config.booking === 'slots'
  if (!hoursSet) return { check, outsideHours: false, hoursSet: false, suggestions: [] }

  // Hledá se kolem zadaného času (dva dny zpět, dva týdny dopředu), nikdy do minulosti.
  const target = input.start ?? now
  const fromDay = maxDay(pragueToday(now), addDays(pragueParts(target).date, -2))
  const data = await loadSlotData(ctx.accountId, config, serviceId, pragueToUtc(fromDay, 0), {
    durationMin: duration + buffer,
    excludeAppointmentId: input.excludeAppointmentId ?? null,
  })
  const staff = input.staffId ? data.staff.filter((s) => s.id === input.staffId) : data.staff
  const scoped = { ...data, staff, now, leadMin: 0 }

  const outsideHours = input.start ? !isWithinHours({ ...scoped, durationMin: duration }, input.start) : false
  const days = computeSlots({ ...scoped, fromDay, days: SEARCH_DAYS, stepMin: BOOKING.stepMin })
  const wantedIsFree = Boolean(input.start && check?.free && !outsideHours)
  const suggestions = pickNearestSlots(days, target, count, pragueToUtc, wantedIsFree ? input.start : null)
  return { check, outsideHours, hoursSet: true, suggestions }
}

const maxDay = (a: string, b: string) => (a >= b ? a : b)
