import 'server-only'
import { wsDb } from '../db'
import type { WsBusiness, WsContext } from '../context'
import type { Invoice } from '../money/data'
import { composeCustomerEmail, composeOutreachEmail } from './compose'
import { signLink, unsubscribeUrl } from './links'
import { isOn, loadSender } from './notify'
import { enqueueEmail, releaseDraft } from './queue'

// Ruční odeslání z aplikace (S15): zpráva z „Komu napsat“ (S12) a faktura (S14).

type Biz = Pick<WsBusiness, 'id'>

export type SendOutcome = 'queued' | 'no_consent' | 'gone' | 'off' | 'read_only'

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
