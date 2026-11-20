import 'server-only'
import { z } from 'zod'
import { adminDb, q, type AdminQuery } from '@/lib/admin/db'
import { CONSULTATION_SLOT_MINUTES } from '@/lib/consultations/rules'

/**
 * Volno pro klienty v kalendáři adminu (KP14, migrace 123, R-126).
 *
 * Volno není událost: drží se v `client_availability` v pražském nástěnném
 * čase a kalendář kreslí jeho výskyty jako plochu pod událostmi. Klienti si
 * v něm rezervují konzultace (`consultation_free_slots`).
 */

export type RawAvailability = {
  /** Id volna — u opakovaného je pro všechny výskyty stejné. */
  id: string
  /** Pražský den výskytu 'YYYY-MM-DD'. */
  day: string
  starts_at: string
  ends_at: string
  slot_minutes: number
  repeat_weekly: boolean
  repeat_until: string | null
}

const dayOnly = (v: unknown): string | null => {
  if (v == null) return null
  return v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10)
}

/** Výskyty volna v pražských dnech `[from, toInclusive]`. */
export function availabilityQuery(from: string, toInclusive: string): AdminQuery {
  return q`
    SELECT availability_id::text AS id, day, starts_at, ends_at, slot_minutes, repeat_weekly, repeat_until
    FROM client_availability_occurrences(${from}::date, ${toInclusive}::date)
  `
}

export function mapAvailability(rows: Record<string, unknown>[]): RawAvailability[] {
  return rows.map((r) => ({
    id: String(r.id),
    day: dayOnly(r.day) ?? '',
    starts_at: new Date(r.starts_at as string).toISOString(),
    ends_at: new Date(r.ends_at as string).toISOString(),
    slot_minutes: Number(r.slot_minutes),
    repeat_weekly: r.repeat_weekly === true,
    repeat_until: dayOnly(r.repeat_until),
  }))
}

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Neplatné datum.')
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Neplatný čas.')
const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))

export const availabilitySchema = z
  .object({
    day: isoDay,
    start: clock,
    end: clock,
    slotMinutes: z.coerce
      .number()
      .int()
      .refine((n) => (CONSULTATION_SLOT_MINUTES as readonly number[]).includes(n), 'Vyberte délku konzultace.'),
    repeatWeekly: z.boolean(),
    repeatUntil: isoDay.nullable(),
  })
  .refine((v) => toMinutes(v.end) > toMinutes(v.start), { message: 'Konec musí být po začátku.', path: ['end'] })
  .refine((v) => toMinutes(v.end) - toMinutes(v.start) >= v.slotMinutes, {
    message: 'Do volna se nevejde ani jedna konzultace. Prodlužte ho, nebo zkraťte konzultaci.',
    path: ['end'],
  })
  .refine((v) => !v.repeatWeekly || v.repeatUntil === null || v.repeatUntil >= v.day, {
    message: 'Opakování musí skončit až po prvním dni.',
    path: ['repeatUntil'],
  })

export type AvailabilityInput = z.infer<typeof availabilitySchema>

export async function insertAvailability(input: AvailabilityInput): Promise<string> {
  const rows = await adminDb<{ id: string }>`
    INSERT INTO client_availability (day, start_time, end_time, slot_minutes, repeat_weekly, repeat_until)
    VALUES (${input.day}::date, ${input.start}::time, ${input.end}::time, ${input.slotMinutes},
            ${input.repeatWeekly}, ${input.repeatWeekly ? input.repeatUntil : null}::date)
    RETURNING id::text
  `
  return rows[0].id
}

/** Co se smazalo, aby „Zpět" vrátilo přesně totéž. */
export type AvailabilitySnapshot =
  | { scope: 'series'; row: AvailabilityRow }
  | { scope: 'day'; id: string; day: string }

type AvailabilityRow = {
  id: string
  day: string
  start_time: string
  end_time: string
  slot_minutes: number
  repeat_weekly: boolean
  repeat_until: string | null
  skip_days: string[]
}

/**
 * Smaže celé volno, nebo u opakovaného jen jeden den (přidá ho do
 * `skip_days`). Rezervace, které už ve volnu jsou, zůstávají — volno jen
 * přestane nabízet nové časy.
 */
export async function removeAvailability(id: string, scope: 'series' | 'day', day: string): Promise<AvailabilitySnapshot | null> {
  if (scope === 'day') {
    const rows = await adminDb<{ id: string }>`
      UPDATE client_availability
      SET skip_days = array_append(skip_days, ${day}::date)
      WHERE id = ${id} AND repeat_weekly AND NOT (${day}::date = ANY (skip_days))
      RETURNING id::text
    `
    if (rows[0]) return { scope: 'day', id, day }
  }
  const rows = await adminDb<Record<string, unknown>>`
    DELETE FROM client_availability WHERE id = ${id}
    RETURNING id::text, day, start_time::text, end_time::text, slot_minutes, repeat_weekly, repeat_until, skip_days::text[]
  `
  const r = rows[0]
  if (!r) return null
  return {
    scope: 'series',
    row: {
      id: String(r.id),
      day: dayOnly(r.day) ?? '',
      start_time: String(r.start_time),
      end_time: String(r.end_time),
      slot_minutes: Number(r.slot_minutes),
      repeat_weekly: r.repeat_weekly === true,
      repeat_until: dayOnly(r.repeat_until),
      skip_days: Array.isArray(r.skip_days) ? r.skip_days.map((d) => String(d).slice(0, 10)) : [],
    },
  }
}

const snapshotSchema = z.discriminatedUnion('scope', [
  z.object({ scope: z.literal('day'), id: z.string().uuid(), day: isoDay }),
  z.object({
    scope: z.literal('series'),
    row: z.object({
      id: z.string().uuid(),
      day: isoDay,
      start_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
      end_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
      slot_minutes: z.number().int().min(15).max(180),
      repeat_weekly: z.boolean(),
      repeat_until: isoDay.nullable(),
      skip_days: z.array(isoDay).max(400),
    }),
  }),
])

/** „Zpět" po smazání. Snímek přišel z prohlížeče, takže se znovu ověří. */
export async function restoreAvailability(raw: unknown): Promise<void> {
  const snap = snapshotSchema.parse(raw)
  if (snap.scope === 'day') {
    await adminDb`
      UPDATE client_availability SET skip_days = array_remove(skip_days, ${snap.day}::date) WHERE id = ${snap.id}
    `
    return
  }
  const r = snap.row
  await adminDb`
    INSERT INTO client_availability (id, day, start_time, end_time, slot_minutes, repeat_weekly, repeat_until, skip_days)
    VALUES (${r.id}, ${r.day}::date, ${r.start_time}::time, ${r.end_time}::time, ${r.slot_minutes},
            ${r.repeat_weekly}, ${r.repeat_until}::date, ${r.skip_days}::date[])
    ON CONFLICT (id) DO NOTHING
  `
}
