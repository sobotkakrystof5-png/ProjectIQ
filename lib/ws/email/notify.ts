import 'server-only'
import { q, wsDb, type WsRow } from '../db'
import { canWrite, getBillingState } from '../billing'
import { ALWAYS_ON_MODULES } from '../templates/types'
import { formatDayLong, formatMinutes, pragueParts } from '../time'
import { isMessageType, MESSAGES, type MessageType, type TemplateValues } from './catalog'
import { composeCustomerEmail, type CustomerExtras } from './compose'
import { renderEmail, type EmailBlock } from './layout'
import { actionLinkUrl, calendarUrl, emailOrigin, signLink } from './links'
import { cancelQueued, enqueueEmail, flushAccount } from './queue'

// Události → e-maily (S15). Každá funkce:
//   - ověří, že je typ zapnutý (Nastavení › E-maily) a funkce byznysu běží,
//   - zařadí zprávu do fronty (enqueueEmail, s klíčem události),
//   - nikdy nevyhodí — chyba e-mailu nesmí zrušit akci, která proběhla.
// Odeslání: `deliver(scope)` po akci (krátký časový limit), jinak živé
// obnovení a denní cron.
//
// E-maily zákazníkům jdou jen s aktivním předplatným (R-045: bez něj se
// poptávka uloží, ale zákazníkovi nic neodchází). Majitel dostává vždy.

type Scope = { accountId: string }

/** Prodleva e-mailu po akci se „Zpět“ (toast 8 s) — vrácení ho zruší. */
export const UNDO_DELAY_MS = 60_000
/** Platnost odkazu Potvrdit / Jiný čas v e-mailu majiteli. */
export const ACTION_LINK_HOURS = 72

export type Sender = {
  business: { id: string; name: string; color: string | null; slug: string }
  modules: Set<string>
  settings: Map<MessageType, { enabled: boolean; subject: string | null; body: string | null }>
  owners: string[]
  replyTo: string | null
  customerMail: boolean
}

const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/

export async function loadSender(scope: Scope, businessId: string): Promise<Sender | null> {
  const acc = scope.accountId
  const [biz, modules, settings, owners] = await wsDb(scope).batch([
    q`SELECT id, name, color, slug, settings FROM ws.businesses WHERE account_id = ${acc} AND id = ${businessId}`,
    q`SELECT module FROM ws.business_modules WHERE account_id = ${acc} AND business_id = ${businessId} AND enabled`,
    q`SELECT type, enabled, subject, body FROM ws.message_settings WHERE account_id = ${acc} AND business_id = ${businessId}`,
    q`SELECT email FROM ws.members WHERE account_id = ${acc} AND role = 'owner' AND email IS NOT NULL ORDER BY created_at`,
  ])
  const b = (biz as WsRow[])[0]
  if (!b) return null
  const ownerEmails = (owners as WsRow[]).map((r) => String(r.email).toLowerCase()).filter((e) => EMAIL_RE.test(e))
  const bizSettings = (b.settings ?? {}) as Record<string, unknown>
  const replyTo = typeof bizSettings.reply_to === 'string' && EMAIL_RE.test(bizSettings.reply_to) ? bizSettings.reply_to : (ownerEmails[0] ?? null)
  const map = new Map<MessageType, { enabled: boolean; subject: string | null; body: string | null }>()
  for (const r of settings as WsRow[]) {
    if (isMessageType(r.type)) map.set(r.type, { enabled: Boolean(r.enabled), subject: (r.subject as string | null) ?? null, body: (r.body as string | null) ?? null })
  }
  let customerMail = false
  try {
    customerMail = canWrite(await getBillingState(acc))
  } catch {
    customerMail = false
  }
  return {
    business: { id: String(b.id), name: String(b.name), color: (b.color as string | null) ?? null, slug: String(b.slug) },
    modules: new Set([...(modules as WsRow[]).map((r) => String(r.module)), ...ALWAYS_ON_MODULES]),
    settings: map,
    owners: ownerEmails,
    replyTo,
    customerMail,
  }
}

export function isOn(sender: Sender, type: MessageType): boolean {
  const need = MESSAGES[type].needs
  if (need && !sender.modules.has(need)) return false
  return sender.settings.get(type)?.enabled ?? true
}

export const formatWhen = (d: Date): string => {
  const p = pragueParts(d)
  return `${formatDayLong(p.date)} v ${formatMinutes(p.minutes)}`
}

function log(where: string, scope: Scope, e: unknown) {
  console.error(`ws.email.${where}`, { accountId: scope.accountId, error: e instanceof Error ? e.message : 'unknown' })
}

/** Odešle, co je ve frontě, s krátkým limitem (akce nečeká dlouho). Nikdy nevyhodí. */
export async function deliver(scope: Scope, budgetMs = 2500): Promise<void> {
  await flushAccount(scope, { budgetMs, limit: 10 })
}

async function customerEmail(
  scope: Scope,
  sender: Sender,
  type: MessageType,
  to: { customerId: string | null; email: string | null },
  values: TemplateValues,
  opts: { dedupeKey: string; extras?: CustomerExtras; sendAt?: Date; validUntil?: Date | null },
): Promise<string | null> {
  if (!sender.customerMail || !to.email || !isOn(sender, type)) return null
  const s = sender.settings.get(type)
  const email = composeCustomerEmail({
    type,
    brand: sender.business,
    subject: s?.subject,
    body: s?.body,
    values,
    extras: opts.extras,
  })
  return enqueueEmail(scope, {
    businessId: sender.business.id,
    customerId: to.customerId,
    type,
    to: to.email,
    replyTo: sender.replyTo,
    fromName: sender.business.name,
    email,
    dedupeKey: opts.dedupeKey,
    sendAt: opts.sendAt ?? null,
    validUntil: opts.validUntil ?? null,
  })
}

/** E-mail majiteli (všem vlastníkům účtu). Nezávisí na předplatném. */
export async function ownerEmail(
  scope: Scope,
  sender: Pick<Sender, 'owners'> & { business: { id: string | null; name: string; color: string | null } },
  type: string,
  content: { subject: string; body: string; blocks: EmailBlock[]; footer?: string; unsubscribeUrl?: string | null },
  opts: { dedupeKey: string; validUntil?: Date | null },
): Promise<number> {
  let queued = 0
  for (const to of sender.owners) {
    const email = renderEmail({
      brand: { name: sender.business.name, color: sender.business.color },
      subject: content.subject,
      body: content.body,
      blocks: content.blocks,
      footer: content.footer ?? 'Upozornění z vašeho účtu ZakazIQ. Co chodí e-mailem, nastavíte v Nastavení › E-maily a upozornění.',
      unsubscribeUrl: content.unsubscribeUrl ?? null,
    })
    const id = await enqueueEmail(scope, {
      businessId: sender.business.id,
      type,
      to,
      replyTo: null,
      fromName: 'ZakazIQ',
      email,
      dedupeKey: `${opts.dedupeKey}:${to}`,
      validUntil: opts.validUntil ?? null,
    })
    if (id) queued++
  }
  return queued
}

const appUrl = (path: string) => `${emailOrigin()}${path}`

// --- Poptávka ------------------------------------------------------------------

type RequestRow = {
  status: string
  wanted_start: Date | null
  message: string | null
  customer_id: string | null
  name: string | null
  email: string | null
  phone: string | null
  service: string | null
}

async function loadRequest(scope: Scope, businessId: string, requestId: string): Promise<RequestRow | null> {
  const [r] = await wsDb(scope)`
    SELECT r.status, r.wanted_start, r.message, r.customer_id, c.name, c.email, c.phone, s.name AS service
    FROM ws.requests r
    LEFT JOIN ws.customers c ON c.account_id = r.account_id AND c.id = r.customer_id
    LEFT JOIN ws.services s ON s.account_id = r.account_id AND s.id = r.service_id
    WHERE r.account_id = ${scope.accountId} AND r.business_id = ${businessId} AND r.id = ${requestId}
  `
  return r ? (r as unknown as RequestRow) : null
}

/** Nová poptávka (web, widget, objednávací stránka): potvrzení zákazníkovi a upozornění majiteli s jednorázovými odkazy. */
export async function notifyNewRequest(scope: Scope, businessId: string, requestId: string): Promise<void> {
  try {
    const sender = await loadSender(scope, businessId)
    const r = sender && (await loadRequest(scope, businessId, requestId))
    if (!sender || !r) return
    const when = r.wanted_start ? formatWhen(new Date(r.wanted_start)) : ''
    await customerEmail(
      scope,
      sender,
      'request_received',
      { customerId: r.customer_id, email: r.email },
      { jmeno: r.name ?? '', termin: when, sluzba: r.service ?? '' },
      { dedupeKey: `request_received:${requestId}` },
    )
    if (isOn(sender, 'new_request') && sender.owners.length > 0) {
      const expires = new Date(Date.now() + ACTION_LINK_HOURS * 3_600_000)
      const blocks: EmailBlock[] = [
        {
          kind: 'details',
          highlight: true,
          rows: [
            { label: 'Zákazník', value: r.name ?? '' },
            { label: 'Telefon', value: r.phone ?? '', mono: true },
            { label: 'E-mail', value: r.email ?? '' },
            { label: 'Služba', value: r.service ?? '' },
            { label: 'Chtěný termín', value: when },
            { label: 'Zpráva', value: (r.message ?? '').slice(0, 500) },
          ],
        },
      ]
      for (const to of sender.owners) {
        const [tok] = await wsDb(scope)`
          INSERT INTO ws.action_tokens (account_id, business_id, request_id, expires_at)
          VALUES (${scope.accountId}, ${businessId}, ${requestId}, ${expires}) RETURNING id`
        const link = actionLinkUrl(signLink({ kind: 'a', accountId: scope.accountId, id: String(tok.id) }))
        await ownerEmail(
          scope,
          { owners: [to], business: { id: businessId, name: sender.business.name, color: sender.business.color } },
          'new_request',
          {
            subject: `Nová poptávka: ${r.name ?? 'zákazník'}`,
            body: 'Přišla nová poptávka. Potvrdit ji můžete rovnou z e-mailu, bez přihlášení.',
            blocks: [
              ...blocks,
              {
                kind: 'buttons',
                items: [
                  { label: 'Potvrdit', url: `${link}?akce=potvrdit` },
                  { label: 'Jiný čas', url: `${link}?akce=cas`, primary: false },
                ],
              },
              { kind: 'note', text: `Tlačítka platí ${ACTION_LINK_HOURS} hodin a jdou použít jednou. Vše ostatní najdete v aplikaci: ${appUrl(`/w/${sender.business.slug}/poptavky`)}` },
            ],
          },
          { dedupeKey: `new_request:${requestId}`, validUntil: expires },
        )
      }
    }
  } catch (e) {
    log('newRequest', scope, e)
  }
}

// --- Termíny -----------------------------------------------------------------

type AppointmentRow = {
  id: string
  starts_at: Date
  status: string
  kind: string
  customer_id: string | null
  name: string | null
  email: string | null
  service: string | null
}

async function loadAppointment(scope: Scope, businessId: string, appointmentId: string): Promise<AppointmentRow | null> {
  const [a] = await wsDb(scope)`
    SELECT a.id, a.starts_at, a.status, a.kind, a.customer_id, c.name, c.email, s.name AS service
    FROM ws.appointments a
    LEFT JOIN ws.customers c ON c.account_id = a.account_id AND c.id = a.customer_id
    LEFT JOIN ws.services s ON s.account_id = a.account_id AND s.id = a.service_id
    WHERE a.account_id = ${scope.accountId} AND a.business_id = ${businessId} AND a.id = ${appointmentId}
  `
  return a ? (a as unknown as AppointmentRow) : null
}

const visitValues = (a: AppointmentRow): TemplateValues => ({
  jmeno: a.name ?? '',
  termin: formatWhen(new Date(a.starts_at)),
  sluzba: a.service ?? '',
})

const icsLink = (scope: Scope, appointmentId: string) => calendarUrl(signLink({ kind: 'c', accountId: scope.accountId, id: appointmentId }))

/** Potvrzený termín (z poptávky, z e-mailu majitele nebo ruční rezervace). `changed` = jiný čas, než zákazník chtěl. */
export async function notifyBookingConfirmed(scope: Scope, businessId: string, appointmentId: string, opts: { changed?: boolean } = {}): Promise<void> {
  try {
    const sender = await loadSender(scope, businessId)
    const a = sender && (await loadAppointment(scope, businessId, appointmentId))
    if (!sender || !a || a.kind !== 'visit' || a.status !== 'confirmed') return
    await customerEmail(
      scope,
      sender,
      opts.changed ? 'booking_changed' : 'booking_confirmed',
      { customerId: a.customer_id, email: a.email },
      visitValues(a),
      { dedupeKey: `confirmed:${appointmentId}`, extras: { calendarUrl: icsLink(scope, appointmentId) }, validUntil: new Date(a.starts_at) },
    )
  } catch (e) {
    log('confirmed', scope, e)
  }
}

/**
 * Přesun termínu. E-mail čeká UNDO_DELAY_MS; další přesun ho jen přepíše
 * a vrácení na čas, který zákazník zná, ho zruší (žádný e-mail navíc).
 */
export async function notifyAppointmentMoved(scope: Scope, businessId: string, appointmentId: string, prevStart: Date): Promise<void> {
  try {
    const sender = await loadSender(scope, businessId)
    const a = sender && (await loadAppointment(scope, businessId, appointmentId))
    if (!sender || !a || a.kind !== 'visit' || a.status !== 'confirmed') return
    const [pending] = await wsDb(scope)`
      SELECT id, dedupe_key, payload->>'knownStart' AS known FROM ws.outbound_messages
      WHERE account_id = ${scope.accountId} AND dedupe_key LIKE ${`changed:${appointmentId}:%`} AND status = 'queued'
      ORDER BY created_at DESC LIMIT 1`
    const known = pending?.known ? new Date(String(pending.known)) : prevStart
    if (pending) await cancelQueued(scope, String(pending.dedupe_key))
    if (known.getTime() === new Date(a.starts_at).getTime()) return
    const id = await customerEmail(
      scope,
      sender,
      'booking_changed',
      { customerId: a.customer_id, email: a.email },
      visitValues(a),
      {
        dedupeKey: `changed:${appointmentId}:${Date.now()}`,
        extras: { calendarUrl: icsLink(scope, appointmentId) },
        sendAt: new Date(Date.now() + UNDO_DELAY_MS),
        validUntil: new Date(a.starts_at),
      },
    )
    if (id) {
      await wsDb(scope)`UPDATE ws.outbound_messages SET payload = payload || jsonb_build_object('knownStart', ${known.toISOString()}::text)
        WHERE account_id = ${scope.accountId} AND id = ${id}`
    }
  } catch (e) {
    log('moved', scope, e)
  }
}

/** Odmítnutá poptávka. Odejde po UNDO_DELAY_MS, „Zpět“ (reopen) ji zruší. */
export async function notifyRequestDeclined(scope: Scope, businessId: string, requestId: string): Promise<void> {
  try {
    const sender = await loadSender(scope, businessId)
    const r = sender && (await loadRequest(scope, businessId, requestId))
    if (!sender || !r || r.status !== 'declined') return
    await customerEmail(
      scope,
      sender,
      'booking_declined',
      { customerId: r.customer_id, email: r.email },
      { jmeno: r.name ?? '', termin: r.wanted_start ? formatWhen(new Date(r.wanted_start)) : '', sluzba: r.service ?? '' },
      { dedupeKey: `declined:${requestId}`, sendAt: new Date(Date.now() + UNDO_DELAY_MS) },
    )
  } catch (e) {
    log('declined', scope, e)
  }
}

/** Zrušený termín. Odejde po UNDO_DELAY_MS, obnovení ho zruší. */
export async function notifyAppointmentCancelled(scope: Scope, businessId: string, appointmentId: string): Promise<void> {
  try {
    const sender = await loadSender(scope, businessId)
    const a = sender && (await loadAppointment(scope, businessId, appointmentId))
    if (!sender || !a || a.kind !== 'visit' || a.status !== 'cancelled') return
    await customerEmail(scope, sender, 'booking_declined', { customerId: a.customer_id, email: a.email }, visitValues(a), {
      dedupeKey: `cancelled:${appointmentId}`,
      sendAt: new Date(Date.now() + UNDO_DELAY_MS),
      validUntil: new Date(a.starts_at),
    })
  } catch (e) {
    log('cancelled', scope, e)
  }
}

/** „Zpět“ po odmítnutí nebo zrušení: čekající e-mail se neodešle. */
export async function cancelPendingNotice(scope: Scope, key: `declined:${string}` | `cancelled:${string}`): Promise<void> {
  try {
    await cancelQueued(scope, key)
  } catch (e) {
    log('cancelPending', scope, e)
  }
}

// --- Věrnost a poděkování ------------------------------------------------------

async function loadCard(scope: Scope, businessId: string, customerId: string): Promise<CustomerExtras['card']> {
  const [c] = await wsDb(scope)`
    SELECT lc.stamps, lp.stamps_needed, lp.reward_text
    FROM ws.loyalty_cards lc JOIN ws.loyalty_programs lp ON lp.account_id = lc.account_id AND lp.id = lc.program_id
    WHERE lc.account_id = ${scope.accountId} AND lc.business_id = ${businessId} AND lc.customer_id = ${customerId}
      AND lp.enabled AND lc.status IN ('active', 'full')
    ORDER BY lc.created_at DESC LIMIT 1`
  return c ? { stamps: Number(c.stamps), needed: Number(c.stamps_needed), reward: (c.reward_text as string | null) || null } : null
}

/** Zaplacená návštěva: poděkování se stavem karty; plná karta = navíc „Odměna je připravená“. */
export async function notifyVisitPaid(scope: Scope, businessId: string, appointmentId: string, opts: { rewardReady: boolean }): Promise<void> {
  try {
    const sender = await loadSender(scope, businessId)
    const a = sender && (await loadAppointment(scope, businessId, appointmentId))
    if (!sender || !a || !a.customer_id) return
    const card = sender.modules.has('loyalty') ? await loadCard(scope, businessId, a.customer_id) : null
    const values = { ...visitValues(a), razitka: card ? `${Math.min(card.stamps, card.needed)} z ${card.needed}` : '', odmena: card?.reward ?? '' }
    await customerEmail(scope, sender, 'thank_you', { customerId: a.customer_id, email: a.email }, values, {
      dedupeKey: `thanks:${appointmentId}`,
      extras: { card },
    })
    if (opts.rewardReady && card) {
      await customerEmail(scope, sender, 'reward_ready', { customerId: a.customer_id, email: a.email }, values, {
        dedupeKey: `reward:${appointmentId}`,
        extras: { card },
      })
    }
  } catch (e) {
    log('visitPaid', scope, e)
  }
}

/** Plná karta po hotové zakázce. */
export async function notifyRewardForJob(scope: Scope, businessId: string, jobId: string): Promise<void> {
  try {
    const sender = await loadSender(scope, businessId)
    if (!sender) return
    const [j] = await wsDb(scope)`
      SELECT j.customer_id, c.name, c.email FROM ws.jobs j
      JOIN ws.customers c ON c.account_id = j.account_id AND c.id = j.customer_id
      WHERE j.account_id = ${scope.accountId} AND j.business_id = ${businessId} AND j.id = ${jobId}`
    if (!j) return
    const card = await loadCard(scope, businessId, String(j.customer_id))
    if (!card) return
    await customerEmail(
      scope,
      sender,
      'reward_ready',
      { customerId: String(j.customer_id), email: (j.email as string | null) ?? null },
      { jmeno: String(j.name ?? ''), odmena: card.reward ?? '' },
      { dedupeKey: `reward:job:${jobId}`, extras: { card } },
    )
  } catch (e) {
    log('rewardJob', scope, e)
  }
}

// --- Předplatné ------------------------------------------------------------------

/** Neúspěšná platba předplatného (Stripe webhook): e-mail všem vlastníkům a zvonek. Chodí vždy. */
export async function notifyPaymentFailed(scope: Scope, stripeInvoiceId: string, graceDays: number): Promise<void> {
  try {
    const owners = await wsDb(scope)`
      SELECT email FROM ws.members WHERE account_id = ${scope.accountId} AND role = 'owner' AND email IS NOT NULL`
    const link = '/w/ucet'
    await ownerEmail(
      scope,
      { owners: owners.map((o) => String(o.email).toLowerCase()).filter((e) => EMAIL_RE.test(e)), business: { id: null, name: 'ZakazIQ', color: null } },
      'payment_failed',
      {
        subject: 'Platba za ZakazIQ se nepovedla',
        body: `Předplatné se nepodařilo zaplatit z vaší karty. Aplikace poběží dál ${graceDays} dní, pak bude jen pro čtení. Data se nemažou a poptávky z webu se ukládají dál.\n\nVyměňte prosím kartu v nastavení účtu.`,
        blocks: [{ kind: 'buttons', items: [{ label: 'Vyměnit kartu', url: appUrl(link) }] }],
        footer: 'Upozornění na platby chodí vždy, nejde je vypnout.',
      },
      { dedupeKey: `payment_failed:${stripeInvoiceId}` },
    )
    await wsDb(scope)`
      INSERT INTO ws.notifications (account_id, business_id, type, title, body, link)
      SELECT ${scope.accountId}, NULL, 'payment_failed', 'Platba předplatného se nepovedla', 'Vyměňte prosím kartu.', ${`${link}?platba=${stripeInvoiceId}`}
      WHERE NOT EXISTS (SELECT 1 FROM ws.notifications WHERE account_id = ${scope.accountId} AND type = 'payment_failed' AND link = ${`${link}?platba=${stripeInvoiceId}`})`
    await deliver(scope)
  } catch (e) {
    log('paymentFailed', scope, e)
  }
}
