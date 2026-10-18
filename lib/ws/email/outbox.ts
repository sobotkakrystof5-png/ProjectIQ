import 'server-only'
import { wsDb } from '../db'
import type { WsBusiness, WsContext } from '../context'
import type { Invoice } from '../money/data'
import { composeCustomerEmail, composeOutreachEmail } from './compose'
import { CUSTOMER_MESSAGE_TYPES, fillTemplate, type CustomerMessageType, type TemplateValues } from './catalog'
import { signLink, unsubscribeUrl } from './links'
import { formatWhen, isOn, loadSender } from './notify'
import { enqueueEmail, releaseDraft } from './queue'
import { emailFromAddress } from './transport'
import { hitLimit } from '../intake/rate-limit'
import { mailtoAddress } from './mailto'

// Ruční odeslání z aplikace (S15): zpráva z „Komu napsat“ (S12) a faktura (S14).

type Biz = Pick<WsBusiness, 'id'>

export type SendOutcome = 'queued' | 'no_consent' | 'gone' | 'off' | 'read_only'

export type CustomerMessageSend =
  | { status: 'queued'; id: string; dedupeKey: string }
  | { status: 'mailto'; href: string }
  | { status: 'no_consent' | 'unsubscribed' | 'gone' | 'off' | 'read_only' | 'limited' }

const CUSTOMER_MESSAGE_DELAY_MS = 60_000
const CUSTOMER_MESSAGE_LIMIT = { name: 'customer-email', max: 30, windowSec: 3600 }

/** Ruční e-mail ze zákaznické karty. Nabídka se kontroluje jako marketingová zpráva. */
export async function sendCustomerMessage(
  ctx: WsContext,
  business: Biz,
  input: { customerId: string; type: CustomerMessageType; subject: string; body: string },
): Promise<CustomerMessageSend> {
  const [customer] = await wsDb(ctx)`
    SELECT c.name, c.email, c.contact_consent_at, c.unsubscribed_at, c.ended_at,
      (SELECT a.starts_at FROM ws.appointments a
        WHERE a.account_id = c.account_id AND a.business_id = ${business.id} AND a.customer_id = c.id
          AND a.status = 'confirmed' AND a.kind = 'visit' AND a.starts_at >= now()
        ORDER BY a.starts_at LIMIT 1) AS next_start,
      (SELECT s.name FROM ws.appointments a JOIN ws.services s ON s.account_id = a.account_id AND s.id = a.service_id
        WHERE a.account_id = c.account_id AND a.business_id = ${business.id} AND a.customer_id = c.id
          AND a.status = 'confirmed' AND a.kind = 'visit' AND a.starts_at >= now()
        ORDER BY a.starts_at LIMIT 1) AS next_service,
      (SELECT j.title FROM ws.jobs j
        WHERE j.account_id = c.account_id AND j.business_id = ${business.id} AND j.customer_id = c.id
        ORDER BY j.created_at DESC LIMIT 1) AS job_title,
      EXISTS (SELECT 1 FROM ws.requests r WHERE r.account_id = c.account_id AND r.business_id = ${business.id} AND r.customer_id = c.id AND NOT r.is_test)
      OR EXISTS (SELECT 1 FROM ws.appointments a WHERE a.account_id = c.account_id AND a.business_id = ${business.id} AND a.customer_id = c.id)
      OR EXISTS (SELECT 1 FROM ws.jobs j WHERE j.account_id = c.account_id AND j.business_id = ${business.id} AND j.customer_id = c.id)
      AS belongs
    FROM ws.customers c
    WHERE c.account_id = ${ctx.accountId} AND c.id = ${input.customerId}
  `
  if (!customer?.belongs || !customer.email) return { status: 'gone' }
  const email = String(customer.email).trim().toLowerCase()
  const encodedAddress = mailtoAddress(email)
  if (!encodedAddress) return { status: 'gone' }
  const marketing = input.type === 'customer_offer'
  if (marketing && customer.unsubscribed_at) return { status: 'unsubscribed' }
  if (marketing && (!customer.contact_consent_at || customer.ended_at)) return { status: 'no_consent' }

  const sender = await loadSender(ctx, business.id)
  if (!sender) return { status: 'gone' }
  if (!isOn(sender, input.type)) return { status: 'off' }

  const subject = input.subject.replace(/[\r\n]+/g, ' ').trim().slice(0, 150)
  const body = input.body.trim().slice(0, 2000)
  if (!subject || !body) return { status: 'gone' }

  const values: TemplateValues = {
    jmeno: String(customer.name),
    byznys: sender.business.name,
    termin: customer.next_start ? formatWhen(new Date(String(customer.next_start))) : '',
    sluzba: String(customer.next_service ?? ''),
    zakazka: String(customer.job_title ?? ''),
  }
  const resolvedSubject = fillTemplate(subject, values).replace(/[\r\n]+/g, ' ').slice(0, 150)
  const resolvedBody = fillTemplate(body, values).slice(0, 2000)
  const unsubscribe = marketing
    ? unsubscribeUrl(signLink({ kind: 'u', accountId: ctx.accountId, id: input.customerId }))
    : null

  // Dočasně bez ověřeného odesílatele se otevře poštovní program. Nic se
  // neukládá jako odeslané a zákazníkovi nepřijde falešné potvrzení.
  if (!emailFromAddress() || !process.env.RESEND_API_KEY) {
    const fallbackBody = unsubscribe ? `${resolvedBody}\n\nOdhlásit se z dalších nabídek: ${unsubscribe}` : resolvedBody
    const params = new URLSearchParams({ subject: resolvedSubject, body: fallbackBody })
    return { status: 'mailto', href: `mailto:${encodedAddress}?${params.toString()}` }
  }
  if (!sender.customerMail) return { status: 'read_only' }
  if (await hitLimit(CUSTOMER_MESSAGE_LIMIT, ctx.accountId)) return { status: 'limited' }
  const emailContent = marketing
    ? composeOutreachEmail({ brand: sender.business, subject: resolvedSubject, body: resolvedBody, unsubscribeUrl: unsubscribe! })
    : composeCustomerEmail({
        type: input.type,
        brand: sender.business,
        subject: resolvedSubject,
        body: resolvedBody,
        values,
      })
  const dedupeKey = `customer-message:${crypto.randomUUID()}`
  const id = await enqueueEmail(ctx, {
    businessId: business.id,
    customerId: input.customerId,
    type: input.type,
    to: email,
    replyTo: sender.replyTo,
    fromName: sender.business.name,
    email: emailContent,
    dedupeKey,
    sendAt: new Date(Date.now() + CUSTOMER_MESSAGE_DELAY_MS),
    unsubscribeUrl: unsubscribe,
  })
  return id ? { status: 'queued', id, dedupeKey } : { status: 'gone' }
}

/**
 * Koncept „Komu napsat“ → fronta. Souhlas se ověří tady i těsně před
 * odesláním (fronta), zpráva nese odkaz na odhlášení jedním klikem.
 */
export async function sendOutreachDraft(ctx: WsContext, business: Biz, draftId: string): Promise<SendOutcome> {
  const [d] = await wsDb(ctx)`
    SELECT m.id, m.subject, m.payload->>'body' AS body, m.customer_id,
           (c.contact_consent_at IS NOT NULL AND c.unsubscribed_at IS NULL AND c.ended_at IS NULL AND c.email IS NOT NULL) AS ok
    FROM ws.outbound_messages m
    LEFT JOIN ws.customers c ON c.account_id = m.account_id AND c.id = m.customer_id
    WHERE m.account_id = ${ctx.accountId} AND m.business_id = ${business.id} AND m.id = ${draftId}
      AND m.status = 'draft' AND m.type LIKE 'outreach\\_%'`
  if (!d) return 'gone'
  if (!d.ok || !d.customer_id) return 'no_consent'
  const sender = await loadSender(ctx, business.id)
  if (!sender) return 'gone'
  if (!sender.customerMail) return 'read_only'
  const unsub = unsubscribeUrl(signLink({ kind: 'u', accountId: ctx.accountId, id: String(d.customer_id) }))
  const email = composeOutreachEmail({ brand: sender.business, subject: String(d.subject ?? ''), body: String(d.body ?? ''), unsubscribeUrl: unsub })
  const released = await releaseDraft(ctx, business.id, draftId, { email, fromName: sender.business.name, replyTo: sender.replyTo, unsubscribeUrl: unsub })
  return released ? 'queued' : 'gone'
}

const money = (amount: number, currency: string) =>
  new Intl.NumberFormat('cs-CZ', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount)

const czDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return `${d}. ${m}. ${y}`
}

/** Faktura e-mailem s PDF v příloze. Stejná faktura nejde do fronty dvakrát, dokud se neodešle. */
export async function sendInvoiceEmail(ctx: WsContext, business: Biz, invoice: Invoice, to: string): Promise<SendOutcome | 'pending'> {
  const sender = await loadSender(ctx, business.id)
  if (!sender) return 'gone'
  if (!isOn(sender, 'invoice')) return 'off'
  if (!sender.customerMail) return 'read_only'
  const [busy] = await wsDb(ctx)`
    SELECT 1 AS busy FROM ws.outbound_messages
    WHERE account_id = ${ctx.accountId} AND business_id = ${business.id} AND type = 'invoice'
      AND payload->>'invoiceId' = ${invoice.id} AND status IN ('queued', 'sending')`
  if (busy) return 'pending'
  // Koncepty ze S14 (před frontou) se nahradí skutečným odesláním.
  await wsDb(ctx)`
    UPDATE ws.outbound_messages SET status = 'cancelled'
    WHERE account_id = ${ctx.accountId} AND business_id = ${business.id} AND type = 'invoice'
      AND payload->>'invoiceId' = ${invoice.id} AND status = 'draft'`
  const s = sender.settings.get('invoice')
  const email = composeCustomerEmail({
    type: 'invoice',
    brand: sender.business,
    subject: s?.subject,
    body: s?.body,
    values: {
      jmeno: invoice.counterparty.name ?? '',
      cislo: invoice.number,
      castka: money(invoice.amount, invoice.currency),
      splatnost: invoice.dueOn ? czDate(invoice.dueOn) : '',
    },
  })
  const id = await enqueueEmail(ctx, {
    businessId: business.id,
    customerId: invoice.customerId,
    type: 'invoice',
    to,
    replyTo: invoice.issuer.email || sender.replyTo,
    fromName: sender.business.name,
    email,
    dedupeKey: `invoice:${invoice.id}:${Date.now()}`,
    invoiceId: invoice.id,
  })
  return id ? 'queued' : 'gone'
}
