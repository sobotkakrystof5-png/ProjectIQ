'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { assertWritable } from '@/lib/ws/billing'
import { normalizePhone } from '@/lib/ws/bookings'
import { hasRole, requireBusiness, requireWorkspace, type WsBusiness, type WsContext } from '@/lib/ws/context'
import * as customers from '@/lib/ws/customers'
import { eraseCustomer as eraseCustomerData } from '@/lib/ws/gdpr'
import * as loyalty from '@/lib/ws/loyalty'
import type { StampOutcome } from '@/lib/ws/loyalty'
import { deliver, notifyVisitPaid } from '@/lib/ws/email/notify'
import { sendCustomerMessage as sendCustomerMessageData, sendOutreachDraft, type SendOutcome } from '@/lib/ws/email/outbox'
import { cancelQueuedCustomerMessage } from '@/lib/ws/email/queue'
import { getEmailSettings } from '@/lib/ws/email/settings'
import { CUSTOMER_MESSAGE_TYPES, MESSAGES, type CustomerMessageType } from '@/lib/ws/email/catalog'
import { createDraft, OUTREACH_KINDS, setDraftDiscarded } from '@/lib/ws/outreach'
import { fail, ok, type Result } from '@/lib/ws/result'
import { refreshSegmentsSafely } from '@/lib/ws/segments'
import { isIsoDate, pragueToday } from '@/lib/ws/time'

// Akce zákazníků, věrnosti a „Komu napsat“ (S12). Každá: requireWorkspace →
// Zod → byznys z URL ověřený proti účtu → assertWritable → zápis
// (lib/ws/{customers,loyalty,outreach}.ts). Přepočet skupiny po změně nikdy
// neshodí akci, která už proběhla.

const BAD_INPUT = 'Něco v údajích nesedí. Zkontrolujte je prosím.'
const FAILED = 'Nepodařilo se uložit. Zkuste to prosím znovu.'
const GONE = 'Tenhle záznam už tu není. Obnovte prosím stránku.'

const slug = z.string().min(1).max(60).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
const uuid = z.string().uuid()

type Ctx = { ctx: WsContext; business: WsBusiness }

/** Hlášky pro lidi mají ve schématu předponu „!“; ostatní (anglické ze Zodu) se nahradí obecnou. */
function userMessage(error: z.ZodError): string | null {
  const msg = error.issues[0]?.message
  return msg?.startsWith('!') ? msg.slice(1) : null
}

async function prepare<T extends { slug: string }>(
  schema: z.ZodType<T>,
  raw: unknown,
  opts: { write?: boolean } = { write: true },
): Promise<{ ok: true; input: T; c: Ctx } | { ok: false; error: string }> {
  const ctx = await requireWorkspace()
  const parsed = schema.safeParse(raw)
  if (!parsed.success) return fail(userMessage(parsed.error) ?? BAD_INPUT)
  const business = await requireBusiness(ctx, parsed.data.slug)
  if (opts.write !== false) {
    const blocked = await assertWritable(ctx)
    if (blocked) return blocked
  }
  return { ok: true, input: parsed.data, c: { ctx, business } }
}

async function guard<T>(name: string, c: Ctx, op: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    const res = await op()
    if (res.ok) revalidatePath(`/w/${c.business.slug}`, 'layout')
    return res
  } catch (e) {
    console.error(name, { accountId: c.ctx.accountId, error: e instanceof Error ? e.message : 'unknown' })
    return fail(FAILED)
  }
}

/** Věta pro toast podle výsledku razítka. */
function stampMessage(stamp: StampOutcome | null, base: string): string {
  if (!stamp) return base
  switch (stamp.result) {
    case 'added':
      if (stamp.full) return `${base} Karta je plná, příště odměna.`
      return `${base} Razítko ${stamp.stamps} z ${stamp.needed}.`
    case 'same_day':
      return `${base} Dnešní razítko už má.`
    case 'full':
      return `${base} Karta je plná, razítko nepřibylo.`
    default:
      return base
  }
}

// --- Zaplacená návštěva -----------------------------------------------------------

/** Částka v Kč, nejvýš na haléře. */
const amount = z
  .number()
  .min(0)
  .max(10_000_000)
  .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6)

const completeSchema = z.object({
  slug,
  appointmentId: uuid,
  amount,
  method: z.enum(['cash', 'card', 'transfer']),
  redeem: z.boolean().optional(),
})

const COMPLETE_ERRORS: Record<loyalty.CompleteVisitError, string> = {
  not_found: GONE,
  already_done: 'Tenhle termín už je zaplacený.',
  cancelled: 'Zrušený termín nejde zaplatit.',
  block: 'Blokace se neplatí.',
}

/** „Hotovo, zaplaceno“ v detailu termínu: příjem, razítko, případně uplatnění odměny. */
export async function completeVisit(raw: unknown): Promise<Result<{ message: string; full: boolean }>> {
  const p = await prepare(completeSchema, raw)
  if (!p.ok) return p.error === BAD_INPUT ? fail('Zadejte prosím částku a způsob platby.') : p
  const { input, c } = p
  return guard('completeVisit', c, async () => {
    const res = await loyalty.completeVisit(c.ctx, c.business, {
      appointmentId: input.appointmentId,
      amount: Math.round(input.amount * 100) / 100,
      method: input.method,
      redeem: input.redeem,
    })
    if (!res.ok) return fail(COMPLETE_ERRORS[res.reason])
    await refreshSegmentsSafely(c.ctx, c.business, [res.data.customerId])
    // Poděkování (a plná karta = odměna) zákazníkovi; chyba e-mailu platbu nevrátí.
    const full = res.data.stamp?.result === 'added' && res.data.stamp.full
    await notifyVisitPaid(c.ctx, c.business.id, input.appointmentId, { rewardReady: full })
    await deliver(c.ctx)
    const base = res.data.redeemed ? 'Hotovo, odměna je uplatněná.' : 'Hotovo a zaplaceno.'
    return ok({
      message: stampMessage(res.data.stamp, base),
      full: res.data.stamp?.result === 'added' && res.data.stamp.full,
    })
  })
}

/** „Dát razítko“ k hotové návštěvě, když se razítkuje ručně. */
export async function stampVisit(raw: unknown): Promise<Result<{ message: string; undoEventId: string; expectedStamps: number; appointmentId: string }>> {
  const p = await prepare(z.object({ slug, appointmentId: uuid }), raw)
  if (!p.ok) return p
  const { input, c } = p
  return guard('stampVisit', c, async () => {
    const { stamp, eventId } = await loyalty.stampVisitManuallyWithEvent(c.ctx, c.business, input.appointmentId)
    if (!stamp) return fail(GONE)
    if (stamp.result === 'duplicate') return fail('Za tuhle návštěvu už razítko je.')
    if (stamp.result === 'none' || stamp.result === 'off') return fail('Tahle návštěva podle pravidel věrnosti razítko nedostane.')
    return stamp.result === 'added' && eventId
      ? ok({ message: stampMessage(stamp, 'Razítko přidáno.'), undoEventId: eventId, expectedStamps: stamp.stamps, appointmentId: input.appointmentId })
      : fail('Razítko se nepodařilo přidat. Obnovte prosím stránku.')
  })
}

const addStampSchema = z.object({
  slug,
  customerId: uuid,
  day: z.string().refine(isIsoDate, '!Vyberte platné datum.'),
  note: z.string().trim().max(200, '!Poznámka je moc dlouhá.').optional(),
})

/** Jedno ruční razítko na kartě zákazníka, volitelně s datem a poznámkou. */
export async function addCustomerStamp(raw: unknown): Promise<Result<{ message: string; undoEventId: string; expectedStamps: number }>> {
  const p = await prepare(addStampSchema, raw)
  if (!p.ok) return p
  const { input, c } = p
  if (input.day > pragueToday()) return fail('Datum razítka nemůže být v budoucnosti.')
  return guard('addCustomerStamp', c, async () => {
    const result = await loyalty.addManualStamp(c.ctx, c.business, {
      customerId: input.customerId,
      day: input.day,
      reason: input.note || null,
    })
    const stamp = result?.stamp
    if (!stamp) return fail(GONE)
    if (stamp.result === 'off') return fail('Věrnostní karty jsou vypnuté. Zapnete je v Nastavení › Věrnost.')
    if (stamp.result === 'full') return fail('Karta je plná. Nejdřív uplatněte odměnu.')
    if (stamp.result !== 'added' || !result.eventId) return fail('Razítko se nepodařilo přidat. Obnovte prosím stránku.')
    return ok({
      message: stampMessage(stamp, 'Razítko přidáno.'),
      undoEventId: result.eventId,
      expectedStamps: stamp.stamps,
    })
  })
}

/** Vrátí právě přidané razítko, pokud kartu mezitím nikdo nezměnil. */
export async function undoCustomerStamp(raw: unknown): Promise<Result<null>> {
  const p = await prepare(
    z.object({ slug, eventId: uuid, expectedStamps: z.number().int().min(1).max(50), appointmentId: uuid.optional() }),
    raw,
  )
  if (!p.ok) return p
  const { input, c } = p
  return guard('undoCustomerStamp', c, async () => {
    const undone = await loyalty.undoStamp(c.ctx, c.business, input)
    return undone ? ok(null) : fail('Kartu už mezitím někdo změnil. Zpět teď nejde použít.')
  })
}

// --- Věrnostní karta zákazníka ------------------------------------------------------

const adjustSchema = z.object({
  slug,
  customerId: uuid,
  delta: z.union([z.literal(1), z.literal(-1)]),
  reason: z.string().trim().min(2, '!Napište prosím krátce důvod.').max(200, '!Důvod je moc dlouhý.'),
})

export async function adjustStamps(raw: unknown): Promise<Result<{ message: string }>> {
  const p = await prepare(adjustSchema, raw)
  if (!p.ok) return p
  const { input, c } = p
  return guard('adjustStamps', c, async () => {
    const res = await loyalty.adjustStamps(c.ctx, c.business, input)
    if (!res) return fail(GONE)
    if (res.result === 'off') return fail('Věrnostní karty jsou vypnuté. Zapnete je v Nastavení › Věrnost.')
    if (res.result === 'full') return fail('Karta je plná. Nejdřív uplatněte odměnu.')
    if (res.result !== 'added') return fail('Na kartě není co odebrat.')
    return ok({ message: input.delta > 0 ? `Razítko přidáno (${res.stamps} z ${res.needed}).` : `Razítko odebráno (${res.stamps} z ${res.needed}).` })
  })
}

export async function redeemReward(raw: unknown): Promise<Result<{ message: string; undoEventId: string }>> {
  const p = await prepare(z.object({ slug, customerId: uuid }), raw)
  if (!p.ok) return p
  const { input, c } = p
  return guard('redeemReward', c, async () => {
    const done = await loyalty.redeemRewardWithEvent(c.ctx, c.business, input.customerId)
    return done.redeemed && done.eventId
      ? ok({ message: 'Odměna je uplatněná. Další razítko začne novou kartu.', undoEventId: done.eventId })
      : fail('Karta zatím není plná.')
  })
}

export async function undoRedeemReward(raw: unknown): Promise<Result<null>> {
  const p = await prepare(z.object({ slug, eventId: uuid }), raw)
  if (!p.ok) return p
  const { input, c } = p
  return guard('undoRedeemReward', c, async () => {
    const undone = await loyalty.undoReward(c.ctx, c.business, input.eventId)
    return undone ? ok(null) : fail('Kartu už mezitím někdo změnil. Zpět teď nejde použít.')
  })
}

// --- Zákazník ---------------------------------------------------------------------

const optionalText = (max: number, tooLong: string) =>
  z
    .string()
    .max(max, `!${tooLong}`)
    .optional()
    .transform((v) => (v && v.trim() ? v.trim() : null))

const updateSchema = z.object({
  slug,
  customerId: uuid,
  name: z.string().trim().min(1, '!Napište prosím jméno.').max(120, '!Jméno je moc dlouhé.'),
  phone: optionalText(30, 'Telefon je moc dlouhý.'),
  email: optionalText(200, 'E-mail je moc dlouhý.'),
  birthday: optionalText(10, 'Datum nevypadá správně.'),
  note: optionalText(2000, 'Poznámka je moc dlouhá, zkraťte ji prosím.'),
})

export async function updateCustomer(raw: unknown): Promise<Result<{ duplicateOf?: { id: string; name: string } }>> {
  const p = await prepare(updateSchema, raw)
  if (!p.ok) return p
  const { input, c } = p

  const phone = input.phone ? normalizePhone(input.phone) : null
  if (input.phone && !phone) return fail('Telefon nevypadá správně. Zkontrolujte ho prosím.')
  const email = input.email ? input.email.toLowerCase() : null
  if (email && !z.string().email().safeParse(email).success) return fail('E-mail nevypadá správně. Zkontrolujte ho prosím.')
  const birthday = input.birthday
  if (birthday && (!isIsoDate(birthday) || birthday < '1900-01-01' || birthday > pragueToday())) {
    return fail('Datum narození nevypadá správně.')
  }

  return guard('updateCustomer', c, async () => {
    const res = await customers.updateCustomer(c.ctx, input.customerId, { name: input.name, phone, email, birthday, note: input.note })
    if (res.ok) return ok({})
    if (res.reason === 'not_found') return fail(GONE)
    if (res.other) return { ok: false, error: `Tenhle telefon nebo e-mail už má ${res.other.name}. Zákazníky můžete sloučit níže.` }
    return fail('Tenhle telefon nebo e-mail už má jiný zákazník.')
  })
}

const contactInput = z.object({ slug, customerId: uuid, field: z.enum(['phone', 'email']), value: z.string().trim().min(1).max(254) })

/** Doplnění jednoho kontaktu z detailu nebo souhrnné karty. */
export async function saveCustomerContact(raw: unknown): Promise<Result<{ value: string; duplicateOf?: { id: string; name: string; contact: string | null } }>> {
  const p = await prepare(contactInput, raw)
  if (!p.ok) return p
  const { input, c } = p
  const value = input.field === 'phone' ? normalizePhone(input.value) : input.value.toLowerCase()
  if (input.field === 'phone' && !value) return fail('Telefon nevypadá správně. Zkontrolujte ho prosím.')
  if (input.field === 'email' && !z.string().email().safeParse(value).success) return fail('E-mail nevypadá správně. Zkontrolujte ho prosím.')
  return guard('saveCustomerContact', c, async () => {
    const res = await customers.updateCustomerContact(c.ctx, input.customerId, input.field, value!)
    if (res.ok) return ok({ value: value! })
    if (res.reason === 'not_found') return fail(GONE)
    if (!res.other) return fail('Tenhle telefon nebo e-mail už má jiný zákazník.')
    return ok({ value: value!, duplicateOf: { ...res.other, contact: value! } })
  })
}

/** Výchozí nebo upravené šablony ruční zprávy, načtené až při otevření okna. */
export async function getCustomerMessageTemplates(raw: unknown): Promise<Result<{ type: CustomerMessageType; subject: string; body: string; enabled: boolean }[]>> {
  const p = await prepare(z.object({ slug }), raw, { write: false })
  if (!p.ok) return p
  try {
    const data = await getEmailSettings(p.c.ctx, p.c.business)
    const rows = new Map(data.rows.map((r) => [r.type, r]))
    return ok(CUSTOMER_MESSAGE_TYPES.map((type) => {
      const row = rows.get(type)
      return { type, subject: row?.subject ?? MESSAGES[type].subject, body: row?.body ?? MESSAGES[type].body, enabled: row?.enabled ?? true }
    }))
  } catch (e) {
    console.error('getCustomerMessageTemplates', { accountId: p.c.ctx.accountId, error: e instanceof Error ? e.message : 'unknown' })
    return fail('Šablony se nepodařilo načíst. Zkuste to prosím znovu.')
  }
}

const sendCustomerMessageInput = z.object({
  slug,
  customerId: uuid,
  type: z.enum(CUSTOMER_MESSAGE_TYPES),
  subject: z.string().trim().min(1, '!Napište prosím předmět.').max(150, '!Předmět je moc dlouhý.'),
  body: z.string().trim().min(1, '!Napište prosím text zprávy.').max(2000, '!Zpráva je moc dlouhá.'),
})

/** Připraví ruční e-mail; při vypnutém Resendu bezpečně vrátí odkaz mailto. */
export async function sendCustomerMessage(raw: unknown): Promise<Result<{ mode: 'queued'; id: string; dedupeKey: string } | { mode: 'mailto'; href: string }>> {
  const p = await prepare(sendCustomerMessageInput, raw)
  if (!p.ok) return p
  const { input, c } = p
  try {
    const res = await sendCustomerMessageData(c.ctx, c.business, input)
    if (res.status === 'mailto') return ok({ mode: 'mailto', href: res.href })
    if (res.status === 'queued') {
      await deliver(c.ctx)
      return ok({ mode: 'queued', id: res.id, dedupeKey: res.dedupeKey })
    }
    const errors = {
      no_consent: 'Tahle nabídka vyžaduje souhlas zákazníka.',
      unsubscribed: 'Zákazník se odhlásil z e-mailů.',
      gone: GONE,
      off: 'Tuto šablonu máte vypnutou v Nastavení.',
      read_only: 'Předplatné je pozastavené, e-maily zákazníkům teď neodcházejí.',
      limited: 'Dnes už jste poslali hodně zpráv. Zkuste to prosím později.',
    } satisfies Record<Exclude<typeof res.status, 'queued' | 'mailto'>, string>
    return fail(errors[res.status])
  } catch (e) {
    console.error('sendCustomerMessage', { accountId: c.ctx.accountId, error: e instanceof Error ? e.message : 'unknown' })
    return fail('E-mail se nepodařilo připravit. Zkuste to prosím znovu.')
  }
}

/** „Zpět“ po ruční zprávě. Zruší se jen zpráva, která stále čeká ve frontě. */
export async function undoCustomerMessage(raw: unknown): Promise<Result<null>> {
  const p = await prepare(z.object({ slug, customerId: uuid, id: uuid }), raw, { write: false })
  if (!p.ok) return p
  const { input, c } = p
  try {
    return await cancelQueuedCustomerMessage(c.ctx, c.business.id, input.customerId, input.id)
      ? ok(null)
      : fail('E-mail už odešel a vrátit ho nejde.')
  } catch (e) {
    console.error('undoCustomerMessage', { accountId: c.ctx.accountId, error: e instanceof Error ? e.message : 'unknown' })
    return fail('E-mail se nepodařilo vrátit. Zkuste to prosím znovu.')
  }
}

export async function setContactConsent(raw: unknown): Promise<Result<null>> {
  const p = await prepare(z.object({ slug, customerId: uuid, consent: z.boolean() }), raw)
  if (!p.ok) return p
  const { input, c } = p
  return guard('setContactConsent', c, async () => {
    const done = await customers.setContactConsent(c.ctx, input.customerId, input.consent)
    if (!done) return fail(GONE)
    await refreshSegmentsSafely(c.ctx, c.business, [input.customerId])
    return ok(null)
  })
}

const endedSchema = z.object({
  slug,
  customerId: uuid,
  ended: z.boolean(),
  reason: z.string().trim().max(200).optional(),
})

/** Ukončit spolupráci (skupina Ukončení) a „Zpět“. */
export async function setCustomerEnded(raw: unknown): Promise<Result<null>> {
  const p = await prepare(endedSchema, raw)
  if (!p.ok) return p
  const { input, c } = p
  return guard('setCustomerEnded', c, async () => {
    const done = await customers.setCustomerEnded(c.ctx, input.customerId, input.ended, input.reason || null)
    if (!done) return fail(GONE)
    await refreshSegmentsSafely(c.ctx, c.business, [input.customerId])
    return ok(null)
  })
}

export async function mergeCustomers(raw: unknown): Promise<Result<{ message: string }>> {
  const p = await prepare(z.object({ slug, keepId: uuid, dropId: uuid }), raw)
  if (!p.ok) return p
  const { input, c } = p
  if (input.keepId === input.dropId) return fail('Vyberte prosím jiného zákazníka.')
  return guard('mergeCustomers', c, async () => {
    const done = await customers.mergeCustomers(c.ctx, input.keepId, input.dropId)
    if (!done) return fail(GONE)
    await refreshSegmentsSafely(c.ctx, c.business, [input.keepId])
    return ok({ message: 'Sloučeno. Návštěvy, poptávky i razítka jsou teď u jednoho zákazníka.' })
  })
}

/**
 * Výmaz na žádost zákazníka (GDPR, R-054). Nejde vrátit, proto potvrzení
 * jménem v panelu. Jen majitel; funguje i bez předplatného — povinnost
 * vyhovět žádosti trvá.
 */
export async function eraseCustomer(raw: unknown): Promise<Result<{ message: string }>> {
  const p = await prepare(z.object({ slug, customerId: uuid }), raw, { write: false })
  if (!p.ok) return p
  const { input, c } = p
  if (!hasRole(c.ctx, 'owner')) return fail('Zákazníka může smazat jen majitel účtu.')
  return guard('eraseCustomer', c, async () => {
    const done = await eraseCustomerData(c.ctx, input.customerId)
    if (!done) return fail(GONE)
    const kept = done.invoicesKept > 0 ? ' Vystavené faktury zůstaly, zákon je vyžaduje uchovat.' : ''
    return ok({ message: `Zákazník je smazaný.${kept}` })
  })
}

export type MergeCandidate = { id: string; name: string; contact: string | null }

/** Hledání zákazníka ke sloučení (jen čtení). */
export async function findMergeCandidates(raw: unknown): Promise<Result<MergeCandidate[]>> {
  const p = await prepare(z.object({ slug, customerId: uuid, query: z.string().max(80) }), raw, { write: false })
  if (!p.ok) return p
  const { input, c } = p
  try {
    const rows = await customers.searchMergeCandidates(c.ctx, input.customerId, input.query)
    return ok(rows.map((r) => ({ id: r.id, name: r.name, contact: r.phone ?? r.email })))
  } catch (e) {
    console.error('findMergeCandidates', { accountId: c.ctx.accountId, error: e instanceof Error ? e.message : 'unknown' })
    return fail('Hledání se nepovedlo. Zkuste to prosím znovu.')
  }
}

// --- Komu napsat ------------------------------------------------------------------

const draftSchema = z.object({
  slug,
  customerId: uuid,
  kind: z.enum(OUTREACH_KINDS),
  subject: z.string().trim().min(1, '!Napište prosím předmět.').max(150, '!Předmět je moc dlouhý.'),
  body: z.string().trim().min(1, '!Napište prosím text zprávy.').max(4000, '!Zpráva je moc dlouhá.'),
})

const NO_CONSENT = 'Tomuhle zákazníkovi psát nemůžeme. Nemá souhlas s nabídkami nebo e-mail.'

const SEND_ERRORS: Record<Exclude<SendOutcome, 'queued'>, string> = {
  no_consent: NO_CONSENT,
  gone: GONE,
  off: 'Tenhle e-mail máte vypnutý v Nastavení.',
  read_only: 'Předplatné je pozastavené, zprávy zákazníkům teď neodcházejí.',
}

/** „Připravit zprávu“ → odeslat (koncept vznikne a hned jde do fronty e-mailů). */
export async function saveMessageDraft(raw: unknown): Promise<Result<{ message: string }>> {
  const p = await prepare(draftSchema, raw)
  if (!p.ok) return p
  const { input, c } = p
  return guard('saveMessageDraft', c, async () => {
    const id = await createDraft(c.ctx, c.business, input)
    if (!id) return fail(NO_CONSENT)
    const sent = await sendOutreachDraft(c.ctx, c.business, id)
    if (sent !== 'queued') return ok({ message: `Zpráva je uložená jako koncept. ${SEND_ERRORS[sent]}` })
    await deliver(c.ctx)
    return ok({ message: 'Zpráva je na cestě.' })
  })
}

/** Odeslat dřív uložený koncept (Připravené zprávy). */
export async function sendMessageDraft(raw: unknown): Promise<Result<{ message: string }>> {
  const p = await prepare(z.object({ slug, id: uuid }), raw)
  if (!p.ok) return p
  const { input, c } = p
  return guard('sendMessageDraft', c, async () => {
    const sent = await sendOutreachDraft(c.ctx, c.business, input.id)
    if (sent !== 'queued') return fail(SEND_ERRORS[sent])
    await deliver(c.ctx)
    return ok({ message: 'Zpráva je na cestě.' })
  })
}

export async function discardMessageDraft(raw: unknown): Promise<Result<null>> {
  const p = await prepare(z.object({ slug, id: uuid, discarded: z.boolean() }), raw)
  if (!p.ok) return p
  const { input, c } = p
  return guard('discardMessageDraft', c, async () =>
    (await setDraftDiscarded(c.ctx, c.business, input.id, input.discarded)) ? ok(null) : fail(GONE),
  )
}
