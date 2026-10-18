import 'server-only'
import { webFields } from '../fields'
import { formatDayShort, formatMinutes, pragueToUtc } from '../time'
import { BOOKING, type IntakeConfig, type PublicSession, type PublicStaffOption } from './intake'
import type { DaySlots } from './slots'

// Tvar odpovědi GET /api/public/v1/schema (S11). Z těchto dat se skládá i
// prompt pro Claude Code. Jen to, co smí vidět veřejnost:
// název, služby, kolonky, volné časy — nic o zákaznících.

export type PublicSchema = {
  success: true
  version: 1
  business: { name: string; slug: string; color: string | null }
  services: { id: string; name: string; durationMin: number; price: number | null; currency: string }[]
  sessions: { id: string; serviceId: string; serviceName: string; start: string; end: string; staffName: string | null; capacity: number; places: number }[]
  fields: { key: string; label: string; type: string; required: boolean; options?: string[]; help?: string }[]
  booking:
    | { mode: 'slots'; stepMin: number; slots: { date: string; label: string; times: { time: string; start: string }[] }[]; staff?: PublicStaffOption[] }
    | { mode: 'free'; stepMin: number; maxDays: number; from: string; to: string }
    | { mode: 'none' }
  contact: { name: 'required'; phoneOrEmail: 'required' }
}

export function slotsForPublic(slots: DaySlots[]) {
  return slots.map((d) => ({
    date: d.date,
    label: formatDayShort(d.date),
    times: d.times.map((m) => ({ time: formatMinutes(m), start: pragueToUtc(d.date, m).toISOString() })),
  }))
}

/** Volné časy pro objednávací stránku (minuty dne místo okamžiku). */
export function orderSlots(slots: DaySlots[]) {
  return slots.map((d) => ({
    date: d.date,
    label: formatDayShort(d.date),
    times: d.times.map((m) => ({ time: formatMinutes(m), minutes: m })),
  }))
}

export function buildPublicSchema(config: IntakeConfig, slots: DaySlots[], staff: PublicStaffOption[] = [], sessions: PublicSession[] = []): PublicSchema {
  const booking: PublicSchema['booking'] =
    config.booking === 'slots'
      ? {
          mode: 'slots',
          stepMin: BOOKING.stepMin,
          slots: slotsForPublic(slots),
          ...(staff.length > 1 ? { staff } : {}),
        }
      : config.booking === 'free'
        ? {
            mode: 'free',
            stepMin: BOOKING.stepMin,
            maxDays: BOOKING.freeDays,
            from: formatMinutes(BOOKING.freeFrom),
            to: formatMinutes(BOOKING.freeTo),
          }
        : { mode: 'none' }
  return {
    success: true,
    version: 1,
    business: { name: config.business.name, slug: config.business.slug, color: config.business.color },
    services: config.services.map((s) => ({
      id: s.id,
      name: s.name,
      durationMin: s.duration_min,
      price: s.price,
      currency: s.currency,
    })),
    sessions: sessions.map((session) => ({
      id: session.id,
      serviceId: session.serviceId,
      serviceName: session.serviceName,
      start: session.start.toISOString(),
      end: session.end.toISOString(),
      staffName: session.staffName,
      capacity: session.capacity,
      places: session.places,
    })),
    fields: webFields(config.fields).map((f) => ({
      key: f.key,
      label: f.label,
      type: f.type,
      required: f.required,
      ...(f.options.length ? { options: f.options } : {}),
      ...(f.help_text ? { help: f.help_text } : {}),
    })),
    booking,
    contact: { name: 'required', phoneOrEmail: 'required' },
  }
}
