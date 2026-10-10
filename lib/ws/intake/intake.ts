import 'server-only'
import { createHash } from 'crypto'
import { z } from 'zod'
import { isUniqueViolation, q, wsDb, type WsRow } from '../db'
import type { WsContext } from '../context'
import { canWrite, getBillingState } from '../billing'
import { findOrCreateCustomer, normalizePhone } from '../bookings'
import { fieldValuesSchema, type FieldDefinition } from '../fields'
import { addDays, formatDayShort, formatMinutes, isIsoDate, pragueParts, pragueToday, pragueToUtc } from '../time'
import { computeSlots, isSlotFree, toRange, type DaySlots, type Range, type StaffAvailability } from './slots'

// Příjem poptávek z webů klientů (S11, B6, skill zakaziq-workspace-backend § 5).
// Jedna cesta pro všechny vstupy: API s tajným klíčem (server webu), API
// s veřejným klíčem (widget), objednávací stránka /r/[slug] a „Ověřit
// napojení“ z aplikace. Účet a byznys přicházejí vždy z ověřeného zdroje
// (klíč, veřejný slug) — nikdy z těla požadavku.
//
// Pořadí: konfigurace byznysu → Zod (jádro + vlastní kolonky) → služba
// a čas → idempotence → zákazník → uložení → teprve potom záznam, upozornění
// a čas použití klíče, každé zvlášť v try/catch (uložení nikdy neshodí).
// Neaktivní předplatné poptávku neodmítne (B5), jen se vrátí upozornění.

export type IntakeChannel = 'secret' | 'widget' | 'page' | 'check'

export type IntakeSource = {
  accountId: string
  businessId: string
  integrationId: string | null
  channel: IntakeChannel
  /** Doména webu (widget), jen pro záznam. */
  origin: string | null
}

export type ApiCode =
  | 'RATE_LIMITED'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN_ORIGIN'
  | 'INVALID_BODY'
  | 'VALIDATION_ERROR'
  | 'SLOT_TAKEN'
  | 'IDEMPOTENCY_MISMATCH'
  | 'IN_PROGRESS'
  | 'NOT_CONFIGURED'
  | 'SERVER_ERROR'

export type ApiNotice = { code: 'SUBSCRIPTION_INACTIVE'; message: string }

export type ApiSuccess = { success: true; id: string; test?: true; duplicate?: true; notice?: ApiNotice }
export type ApiFailure = { success: false; code: ApiCode; error: string; issues?: { field: string; message: string }[] }
export type ApiBody = ApiSuccess | ApiFailure

export type IntakeResult = { status: number; body: ApiBody; replayed?: boolean }

export const apiError = (status: number, code: ApiCode, error: string, issues?: ApiFailure['issues']): IntakeResult => ({
  status,
  body: issues?.length ? { success: false, code, error, issues } : { success: false, code, error },
})

export const SUBSCRIPTION_NOTICE: ApiNotice = {
  code: 'SUBSCRIPTION_INACTIVE',
  message: 'Poptávka je uložená. Předplatné firmy je pozastavené, takže zákazník nedostane potvrzovací e-mail.',
}

// --- Konfigurace byznysu ----------------------------------------------------

export type BookingMode = 'slots' | 'free' | 'none'

export type IntakeService = { id: string; name: string; duration_min: number; price: number | null; currency: string }

export type IntakeConfig = {
  business: { id: string; name: string; slug: string; color: string | null; industry: string }
  services: IntakeService[]
  fields: FieldDefinition[]
  /** slots = volné časy z otevírací doby; free = zákazník navrhne čas sám (doba nenastavená); none = bez času (bez kalendáře) */
  booking: BookingMode
  hours: Map<number, Range[]>
}

/** Pravidla nabídky času (sdílí API, stránka i widget). */
export const BOOKING = {
  stepMin: 30,
  leadMin: 60,
  slotDays: 21,
  /** Režim free: jak daleko dopředu a v jakých hodinách může zákazník čas navrhnout. */
  freeDays: 60,
  freeFrom: 7 * 60,
  freeTo: 20 * 60,
} as const

const scope = (accountId: string): WsContext => ({ userId: 'system:intake', accountId, role: 'staff' })

export async function loadIntakeConfig(accountId: string, businessId: string): Promise<IntakeConfig | null> {
  const [biz, modules, services, fields, hours] = await wsDb({ accountId }).batch([
    q`SELECT id, name, slug, color, industry FROM ws.businesses
      WHERE account_id = ${accountId} AND id = ${businessId} AND archived_at IS NULL`,
    q`SELECT module FROM ws.business_modules
      WHERE account_id = ${accountId} AND business_id = ${businessId} AND enabled AND module = 'calendar'`,
    q`SELECT id, name, duration_min, price, currency FROM ws.services
      WHERE account_id = ${accountId} AND business_id = ${businessId} AND active AND show_on_web
      ORDER BY position, name LIMIT 100`,
    q`SELECT key, label, type, required, options, help_text FROM ws.field_definitions
      WHERE account_id = ${accountId} AND business_id = ${businessId} AND active AND show_on_web
      ORDER BY position, created_at LIMIT 50`,
    q`SELECT staff_id, weekday, opens::text AS opens, closes::text AS closes FROM ws.opening_hours
      WHERE account_id = ${accountId} AND business_id = ${businessId}`,
  ])
  const b = (biz as WsRow[])[0]
  if (!b) return null

  const businessHours = new Map<number, Range[]>()
  for (const h of hours as WsRow[]) {
    if (h.staff_id !== null) continue
    const wd = Number(h.weekday)
    businessHours.set(wd, [...(businessHours.get(wd) ?? []), toRange(String(h.opens), String(h.closes))])
  }
  const calendar = (modules as WsRow[]).length > 0
  return {
    business: {
      id: String(b.id),
      name: String(b.name),
      slug: String(b.slug),
      color: (b.color as string | null) ?? null,
      industry: String(b.industry),
    },
    services: (services as WsRow[]).map((s) => ({
      id: String(s.id),
      name: String(s.name),
      duration_min: Number(s.duration_min),
      price: s.price === null ? null : Number(s.price),
      currency: String(s.currency),
    })),
    fields: (fields as WsRow[]).map((f) => ({
      key: String(f.key),
      label: String(f.label),
      type: f.type as FieldDefinition['type'],
      required: Boolean(f.required),
      options: Array.isArray(f.options) ? (f.options as unknown[]).map(String) : [],
      help_text: (f.help_text as string | null) ?? null,
    })),
    booking: !calendar ? 'none' : (hours as WsRow[]).length > 0 ? 'slots' : 'free',
    hours: businessHours,
  }
}

type SlotData = Omit<Parameters<typeof computeSlots>[0], 'fromDay' | 'days' | 'stepMin'>

async function loadSlotData(accountId: string, config: IntakeConfig, serviceId: string | null, now: Date): Promise<SlotData> {
  const biz = config.business.id
  const from = now
  const to = new Date(now.getTime() + (BOOKING.slotDays + 2) * 86_400_000)
  const [staffRows, shiftRows, busyRows] = await wsDb({ accountId }).batch([
    q`SELECT st.id FROM ws.staff st
      WHERE st.account_id = ${accountId} AND st.business_id = ${biz} AND st.active
        AND (${serviceId}::uuid IS NULL
          OR NOT EXISTS (SELECT 1 FROM ws.service_staff x WHERE x.account_id = st.account_id AND x.service_id = ${serviceId}::uuid)
          OR EXISTS (SELECT 1 FROM ws.service_staff x WHERE x.account_id = st.account_id AND x.service_id = ${serviceId}::uuid AND x.staff_id = st.id))`,
    q`SELECT staff_id, weekday, opens::text AS opens, closes::text AS closes FROM ws.opening_hours
      WHERE account_id = ${accountId} AND business_id = ${biz} AND staff_id IS NOT NULL`,
    q`SELECT staff_id, starts_at, ends_at FROM ws.appointments
      WHERE account_id = ${accountId} AND business_id = ${biz} AND status <> 'cancelled'
        AND starts_at < ${to} AND ends_at > ${from}
      LIMIT 5000`,
  ])
  const shifts = new Map<string, Map<number, Range[]>>()
  for (const h of shiftRows as WsRow[]) {
    const sid = String(h.staff_id)
    const m = shifts.get(sid) ?? new Map<number, Range[]>()
    const wd = Number(h.weekday)
    m.set(wd, [...(m.get(wd) ?? []), toRange(String(h.opens), String(h.closes))])
    shifts.set(sid, m)
  }
  const busy = busyRows as WsRow[]
  const staff: StaffAvailability[] = (staffRows as WsRow[]).map((s) => ({
    id: String(s.id),
    shifts: shifts.get(String(s.id)) ?? null,
    busy: busy
      .filter((a) => a.staff_id === s.id)
      .map((a) => ({ start: a.starts_at as Date, end: a.ends_at as Date })),
  }))
  const service = config.services.find((s) => s.id === serviceId)
  return {
    now,
    durationMin: service?.duration_min ?? 60,
    leadMin: BOOKING.leadMin,
    hours: config.hours,
    staff,
    businessBlocks: busy
      .filter((a) => a.staff_id === null)
      .map((a) => ({ start: a.starts_at as Date, end: a.ends_at as Date })),
  }
}

/** Volné časy na nejbližší 3 týdny (jen režim slots). */
export async function loadSlots(
  accountId: string,
  config: IntakeConfig,
  serviceId: string | null,
  now: Date = new Date(),
): Promise<DaySlots[]> {
  if (config.booking !== 'slots') return []
  const data = await loadSlotData(accountId, config, serviceId, now)
  return computeSlots({ ...data, fromDay: pragueToday(now), days: BOOKING.slotDays, stepMin: BOOKING.stepMin })
}

// --- Vstup ------------------------------------------------------------------

const optionalText = (max: number) =>
  z
    .string()
    .max(max, 'Text je moc dlouhý.')
    .nullish()
    .transform((v) => (v && v.trim() ? v.trim() : null))

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Tělo poptávky (API v1). Popis s příklady: docs/workspace/API.md. */
export const requestInputSchema = z
  .object({
    name: z.string({ error: 'Jméno: vyplňte prosím.' }).trim().min(2, 'Jméno: vyplňte prosím celé jméno.').max(120, 'Jméno je moc dlouhé.'),
    phone: optionalText(40),
    email: optionalText(200).transform((v) => (v ? v.toLowerCase() : null)),
    serviceId: z.string().uuid('Služba: vyberte prosím službu ze seznamu.').nullish(),
    start: z
      .string()
      .max(40)
      .refine((v) => !Number.isNaN(Date.parse(v)) && /T\d{2}:\d{2}/.test(v), 'Čas: pošlete prosím datum a čas ve formátu ISO 8601.')
      .nullish(),
    // Místo `start` jde poslat pražský den a čas (formuláře bez časových pásem).
    date: z.string().refine(isIsoDate, 'Den: pošlete prosím datum ve tvaru RRRR-MM-DD.').nullish(),
    time: z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/, 'Čas: pošlete prosím čas ve tvaru HH:MM.').nullish(),
    message: optionalText(2000),
    fields: z.record(z.string().max(40), z.unknown()).optional(),
    externalId: optionalText(100),
    source: z.enum(['web', 'eshop']).optional(),
    test: z.boolean().optional(),
    // Past na roboty: lidé tohle pole nevidí, vyplněné = robot.
    website: z.string().max(500).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.phone && !normalizePhone(v.phone)) {
      ctx.addIssue({ code: 'custom', path: ['phone'], message: 'Telefon: zadejte prosím číslo, např. +420 777 123 456.' })
    }
    if (v.email && (!EMAIL_RE.test(v.email) || v.email.length > 200)) {
      ctx.addIssue({ code: 'custom', path: ['email'], message: 'E-mail: zkontrolujte prosím adresu.' })
    }
    if (Boolean(v.date) !== Boolean(v.time)) {
      ctx.addIssue({ code: 'custom', path: [v.date ? 'time' : 'date'], message: 'Čas: pošlete prosím den i čas.' })
    }
    if (!v.phone && !v.email) {
      ctx.addIssue({ code: 'custom', path: ['phone'], message: 'Kontakt: vyplňte prosím telefon nebo e-mail.' })
    }
  })

export type RequestInput = z.input<typeof requestInputSchema>

const issuesOf = (error: z.ZodError) =>
  error.issues.slice(0, 10).map((i) => ({ field: i.path.map(String).join('.') || 'body', message: i.message }))

// --- Uložení ----------------------------------------------------------------

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

export const IDEMPOTENCY_KEY_RE = /^[\x21-\x7e]{1,200}$/

type Idem = { key: string; hash: string }

/** Rezervuje klíč. Vrací null (pokračovat), nebo hotovou odpověď (opakování / konflikt). */
async function claimIdempotency(accountId: string, idem: Idem): Promise<IntakeResult | null> {
  const [, inserted, existing] = await wsDb({ accountId }).batch([
    q`DELETE FROM ws.idempotency_keys WHERE account_id = ${accountId} AND key = ${idem.key} AND expires_at < now()`,
    q`INSERT INTO ws.idempotency_keys (account_id, key, request_hash) VALUES (${accountId}, ${idem.key}, ${idem.hash})
      ON CONFLICT (account_id, key) DO NOTHING RETURNING key`,
    q`SELECT request_hash, response FROM ws.idempotency_keys WHERE account_id = ${accountId} AND key = ${idem.key}`,
  ])
  if ((inserted as WsRow[]).length) return null
  const row = (existing as WsRow[])[0]
  if (!row) return null
  if (row.request_hash !== idem.hash) {
    return apiError(422, 'IDEMPOTENCY_MISMATCH', 'Tenhle klíč Idempotency-Key už patří jiné poptávce. Pošlete prosím nový klíč.')
  }
  const stored = row.response as { status?: number; body?: ApiBody } | null
  if (!stored?.body) return apiError(409, 'IN_PROGRESS', 'Stejná poptávka se právě ukládá. Zkuste to prosím za chvíli.')
  return { status: stored.status ?? 202, body: stored.body, replayed: true }
}

async function settleIdempotency(accountId: string, idem: Idem, result: IntakeResult | null): Promise<void> {
  if (result) {
    await wsDb({ accountId })`
      UPDATE ws.idempotency_keys SET response = ${JSON.stringify({ status: result.status, body: result.body })}::jsonb
      WHERE account_id = ${accountId} AND key = ${idem.key}`
  } else {
    // Nepovedlo se uložit — klíč se uvolní, aby šel poslat znovu.
    await wsDb({ accountId })`DELETE FROM ws.idempotency_keys WHERE account_id = ${accountId} AND key = ${idem.key}`
  }
}

const SOURCE: Record<IntakeChannel, string> = { secret: 'web', widget: 'widget', page: 'page', check: 'web' }

/** Zapíše řádek do záznamu požadavků (pro ladění v Nastavení). Nikdy nevyhodí. */
export async function logIntake(
  src: IntakeSource,
  entry: { status: number; code: string | null; requestId: string | null; isTest: boolean },
): Promise<void> {
  try {
    await wsDb({ accountId: src.accountId }).batch([
      q`INSERT INTO ws.intake_log (account_id, business_id, integration_id, channel, origin, status, code, request_id, is_test)
        VALUES (${src.accountId}, ${src.businessId}, ${src.integrationId}::uuid, ${src.channel}, ${src.origin?.slice(0, 200) ?? null},
                ${entry.status}, ${entry.code}, ${entry.requestId}::uuid, ${entry.isTest})`,
      q`DELETE FROM ws.intake_log WHERE account_id = ${src.accountId} AND business_id = ${src.businessId}
        AND created_at < now() - interval '30 days'`,
    ])
  } catch (e) {
    console.error('intake.log', { accountId: src.accountId, error: e instanceof Error ? e.message : 'unknown' })
  }
}

async function afterSave(
  src: IntakeSource,
  config: IntakeConfig,
  saved: { id: string; name: string; service: string | null; start: Date | null; test: boolean },
): Promise<void> {
  const acc = src.accountId
  const tasks: Promise<unknown>[] = []
  if (src.integrationId) {
    tasks.push(
      wsDb({ accountId: acc })`UPDATE ws.web_integrations SET last_used_at = now()
        WHERE account_id = ${acc} AND business_id = ${src.businessId} AND id = ${src.integrationId}`,
    )
  }
  if (!saved.test) {
    const when = saved.start ? pragueParts(saved.start) : null
    const body = [saved.service, when ? `${formatDayShort(when.date)} v ${formatMinutes(when.minutes)}` : null]
      .filter(Boolean)
      .join(' · ')
    tasks.push(
      wsDb({ accountId: acc })`INSERT INTO ws.notifications (account_id, business_id, type, title, body, link)
        VALUES (${acc}, ${src.businessId}, 'new_request', ${`Nová poptávka: ${saved.name}`.slice(0, 200)}, ${body || null},
                ${`/w/${config.business.slug}/poptavky?detail=poptavka:${saved.id}`})`,
    )
    // E-mail zákazníkovi a majiteli přidá S15 (fronta ws.outbound_messages).
  }
  const results = await Promise.allSettled(tasks)
  for (const r of results) {
    if (r.status === 'rejected') {
      console.error('intake.after', { accountId: acc, error: r.reason instanceof Error ? r.reason.message : 'unknown' })
    }
  }
}

/**
 * Přijme poptávku. `raw` je tělo požadavku (už JSON). Vrací stavový kód
 * a tělo odpovědi pro API; objednávací stránka a aplikace si z něj vezmou výsledek.
 */
export async function ingestRequest(
  src: IntakeSource,
  raw: unknown,
  opts: { idempotencyKey?: string | null; now?: Date; forceTest?: boolean } = {},
): Promise<IntakeResult> {
  const now = opts.now ?? new Date()
  const acc = src.accountId

  const finish = async (result: IntakeResult, requestId: string | null, isTest: boolean) => {
    await logIntake(src, {
      status: result.status,
      code: result.body.success ? null : result.body.code,
      requestId,
      isTest,
    })
    return result
  }

  const config = await loadIntakeConfig(acc, src.businessId)
  if (!config) return apiError(401, 'UNAUTHORIZED', 'Klíč nepatří žádné firmě. Zkontrolujte ho prosím v Nastavení › Napojený web.')

  const parsed = requestInputSchema.safeParse(raw)
  const fieldsParsed = fieldValuesSchema(config.fields).safeParse(
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>).fields : undefined,
  )
  if (!parsed.success || !fieldsParsed.success) {
    const issues = [
      ...(parsed.success ? [] : issuesOf(parsed.error)),
      ...(fieldsParsed.success ? [] : issuesOf(fieldsParsed.error).map((i) => ({ ...i, field: `fields.${i.field}` }))),
    ]
    return finish(apiError(400, 'VALIDATION_ERROR', issues[0]?.message ?? 'Něco v údajích nesedí.', issues), null, false)
  }
  const input = parsed.data
  const isTest = Boolean(input.test || opts.forceTest)

  // Robot vyplnil skryté pole: tváříme se, že je hotovo, nic se neuloží.
  if (input.website && input.website.trim()) {
    return finish({ status: 202, body: { success: true, id: '00000000-0000-4000-8000-000000000000' } }, null, true)
  }

  let service: IntakeService | null = null
  if (input.serviceId) {
    service = config.services.find((s) => s.id === input.serviceId) ?? null
    if (!service) {
      return finish(
        apiError(400, 'VALIDATION_ERROR', 'Služba: vyberte prosím službu ze seznamu.', [
          { field: 'serviceId', message: 'Služba: vyberte prosím službu ze seznamu.' },
        ]),
        null,
        false,
      )
    }
  }

  let start: Date | null = input.start
    ? new Date(input.start)
    : input.date && input.time
      ? pragueToUtc(input.date, Number(input.time.split(':')[0]) * 60 + Number(input.time.split(':')[1]))
      : null
  if (start) {
    start.setSeconds(0, 0)
    const latest = addDays(pragueToday(now), config.booking === 'slots' ? BOOKING.slotDays + 1 : 366)
    if (start.getTime() < now.getTime() || pragueParts(start).date > latest) {
      const msg = 'Čas: vyberte prosím termín v budoucnu.'
      return finish(apiError(400, 'VALIDATION_ERROR', msg, [{ field: 'start', message: msg }]), null, false)
    }
    if (config.booking === 'slots' && !isTest) {
      const data = await loadSlotData(acc, config, service?.id ?? null, now)
      if (!isSlotFree(data, start)) {
        return finish(apiError(409, 'SLOT_TAKEN', 'Tenhle čas už je obsazený. Vyberte prosím jiný.'), null, false)
      }
    }
  }

  const idem: Idem | null = opts.idempotencyKey
    ? { key: opts.idempotencyKey, hash: createHash('sha256').update(canonical(raw)).digest('hex') }
    : null
  if (idem) {
    const replay = await claimIdempotency(acc, idem)
    if (replay) return replay
  }

  try {
    const phone = normalizePhone(input.phone)
    const customerId = isTest ? null : await findOrCreateCustomer(scope(acc), { name: input.name, phone, email: input.email })
    const end = start ? new Date(start.getTime() + (service?.duration_min ?? 60) * 60_000) : null
    const contact = JSON.stringify({ name: input.name, phone: phone ?? undefined, email: input.email ?? undefined })
    const source = src.channel === 'secret' ? (input.source ?? 'web') : SOURCE[src.channel]

    const [insertedRows, existingRows] = await wsDb({ accountId: acc }).batch([
      q`INSERT INTO ws.requests (account_id, business_id, customer_id, service_id, integration_id, wanted_start, wanted_end,
                                 contact, field_values, message, source, external_id, is_test)
        VALUES (${acc}, ${src.businessId}, ${customerId}::uuid, ${service?.id ?? null}::uuid, ${src.integrationId}::uuid,
                ${start}::timestamptz, ${end}::timestamptz, ${contact}::jsonb, ${JSON.stringify(fieldsParsed.data)}::jsonb,
                ${input.message}, ${source}, ${input.externalId}, ${isTest})
        ON CONFLICT (business_id, external_id) WHERE external_id IS NOT NULL DO NOTHING
        RETURNING id`,
      q`SELECT id FROM ws.requests WHERE account_id = ${acc} AND business_id = ${src.businessId}
          AND ${input.externalId}::text IS NOT NULL AND external_id = ${input.externalId}::text`,
    ])
    const inserted = (insertedRows as WsRow[])[0]
    const id = String((inserted ?? (existingRows as WsRow[])[0])?.id ?? '')
    if (!id) throw new Error('poptávka se neuložila')
    const duplicate = !inserted

    const billing = await getBillingState(acc, now).catch(() => null)
    const body: ApiSuccess = { success: true, id }
    if (isTest) body.test = true
    if (duplicate) body.duplicate = true
    if (billing && !canWrite(billing)) body.notice = SUBSCRIPTION_NOTICE
    const result: IntakeResult = { status: duplicate ? 200 : 202, body }

    if (idem) await settleIdempotency(acc, idem, result).catch(() => undefined)
    if (!duplicate) await afterSave(src, config, { id, name: input.name, service: service?.name ?? null, start, test: isTest })
    return finish(result, id, isTest)
  } catch (e) {
    if (idem) await settleIdempotency(acc, idem, null).catch(() => undefined)
    // Souběžné založení téhož zákazníka řeší findOrCreateCustomer; sem dojde jen něco jiného.
    console.error('intake.save', {
      accountId: acc,
      error: e instanceof Error ? e.message : 'unknown',
      unique: isUniqueViolation(e),
    })
    return finish(apiError(500, 'SERVER_ERROR', 'Poptávku se nepodařilo uložit. Zkuste to prosím znovu.'), null, isTest)
  }
}

/** Ukázkové hodnoty kolonek pro „Ověřit napojení“ a prompt pro Claude Code. */
export function sampleFieldValues(fields: readonly FieldDefinition[]): Record<string, string | number> {
  const out: Record<string, string | number> = {}
  for (const f of fields) {
    if (f.type === 'number') out[f.key] = 1
    else if (f.type === 'date') out[f.key] = addDays(pragueToday(), 7)
    else if (f.type === 'choice' || f.type === 'select') {
      if (f.options[0]) out[f.key] = f.options[0]
    } else if (f.type === 'text' || f.type === 'address') out[f.key] = f.type === 'address' ? 'Ukázková 1, Praha' : 'Zkouška napojení'
  }
  return out
}
