import 'server-only'
import { wsDb, wsSystem, type WsRow } from '../db'
import { getInvoice } from '../money/data'
import { renderInvoicePdf } from '../money/pdf'
import type { RenderedEmail } from './layout'
import { getEmailTransport, type OutgoingEmail } from './transport'

// Fronta e-mailů ws.outbound_messages (S15, R-050).
//
// Zápis do fronty je jediná cesta ven — akce ani příjem poptávky e-mail
// neposílají přímo, takže selhání odeslání nikdy nezruší uložení.
// Odesílá se hned po zařazení (flushAccount s časovým limitem), při otevřené
// aplikaci s každým živým obnovením a jednou denně cronem (Vercel Hobby,
// R-006). Nepovedené zkusí znovu s rostoucím odstupem, po 5 pokusech je
// zpráva „failed“.
//
// Nezdvojí se: (1) dedupe_key je unikátní za účet, (2) zprávu si bere jeden
// UPDATE … FOR UPDATE SKIP LOCKED, (3) Resend dostane ID zprávy jako klíč
// idempotence, takže ani opakování po pádu uprostřed odeslání nepošle e-mail dvakrát.

type Scope = { accountId: string }

export type QueuedEmail = {
  businessId: string | null
  customerId?: string | null
  type: string
  to: string
  replyTo?: string | null
  fromName: string
  email: RenderedEmail
  /** Jedna zpráva na událost (např. `reminder:<termín>`). Zrušenou jde zařadit znovu. */
  dedupeKey?: string | null
  /** Odeslat nejdřív v tuhle chvíli (např. po uplynutí „Zpět“). */
  sendAt?: Date | null
  /** Po tomhle čase už zpráva nedává smysl (připomínka po termínu) — zruší se. */
  validUntil?: Date | null
  /** Příloha: PDF faktury (načte se až při odeslání). */
  invoiceId?: string | null
  /** Hromadná zpráva: hlavičky pro odhlášení jedním klikem (RFC 8058). */
  unsubscribeUrl?: string | null
}

const BACKOFF_MIN = [1, 5, 30, 120, 720]
export const MAX_ATTEMPTS = 5

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/

/** Zařadí e-mail. Vrátí ID zprávy, nebo null (stejná událost už ve frontě je, nebo neplatná adresa). */
export async function enqueueEmail(scope: Scope, m: QueuedEmail): Promise<string | null> {
  const to = m.to.trim().toLowerCase()
  if (!EMAIL_RE.test(to) || to.length > 254) return null
  const replyTo = m.replyTo && EMAIL_RE.test(m.replyTo) ? m.replyTo : null
  const payload = JSON.stringify({
    html: m.email.html,
    text: m.email.text,
    fromName: m.fromName,
    validUntil: m.validUntil?.toISOString() ?? null,
    invoiceId: m.invoiceId ?? null,
    unsubscribeUrl: m.unsubscribeUrl ?? null,
  })
  const sendAt = m.sendAt ?? new Date()
  const rows = await wsDb(scope)`
    INSERT INTO ws.outbound_messages (account_id, business_id, customer_id, channel, type, to_address, reply_to, subject, payload, status, next_attempt_at, dedupe_key)
    VALUES (${scope.accountId}, ${m.businessId}, ${m.customerId ?? null}, 'email', ${m.type}, ${to}, ${replyTo}, ${m.email.subject},
            ${payload}::jsonb, 'queued', ${sendAt}, ${m.dedupeKey ?? null})
    ON CONFLICT (account_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO UPDATE
      SET status = 'queued', attempts = 0, last_error = NULL, to_address = EXCLUDED.to_address, reply_to = EXCLUDED.reply_to,
          subject = EXCLUDED.subject, payload = EXCLUDED.payload, next_attempt_at = EXCLUDED.next_attempt_at
      WHERE ws.outbound_messages.status = 'cancelled'
    RETURNING id
  `
  return rows[0] ? String(rows[0].id) : null
}

/** Zruší čekající zprávu události (např. „Zpět“ po odmítnutí). Odeslanou nevrátí. */
export async function cancelQueued(scope: Scope, dedupeKey: string): Promise<boolean> {
  const rows = await wsDb(scope)`
    UPDATE ws.outbound_messages SET status = 'cancelled'
    WHERE account_id = ${scope.accountId} AND dedupe_key = ${dedupeKey} AND status = 'queued'
    RETURNING id
  `
  return rows.length > 0
}

/** Koncept (S12 „Komu napsat“, S14 faktura) → fronta. Jen koncepty, ostatní se nezmění. */
export async function releaseDraft(
  scope: Scope,
  businessId: string,
  id: string,
  ready: { email: RenderedEmail; fromName: string; replyTo: string | null; invoiceId?: string | null; unsubscribeUrl?: string | null },
): Promise<boolean> {
  const payload = JSON.stringify({
    html: ready.email.html,
    text: ready.email.text,
    fromName: ready.fromName,
    validUntil: null,
    invoiceId: ready.invoiceId ?? null,
    unsubscribeUrl: ready.unsubscribeUrl ?? null,
  })
  const rows = await wsDb(scope)`
    UPDATE ws.outbound_messages
    SET status = 'queued', subject = ${ready.email.subject}, reply_to = ${ready.replyTo}, payload = ${payload}::jsonb,
        next_attempt_at = now(), attempts = 0, last_error = NULL
    WHERE account_id = ${scope.accountId} AND business_id = ${businessId} AND id = ${id} AND status = 'draft'
    RETURNING id
  `
  return rows.length > 0
}

type Claimed = {
  id: string
  business_id: string | null
  customer_id: string | null
  type: string
  to_address: string
  reply_to: string | null
  subject: string | null
  payload: Record<string, unknown>
  attempts: number
}

/** Vezme si zprávy k odeslání (souběžný běh si je nepřebere — SKIP LOCKED). */
async function claim(scope: Scope, limit: number): Promise<Claimed[]> {
  const rows = await wsDb(scope)`
    UPDATE ws.outbound_messages m SET status = 'sending', attempts = m.attempts + 1
    WHERE m.id IN (
      SELECT id FROM ws.outbound_messages
      WHERE account_id = ${scope.accountId} AND channel = 'email'
        AND ((status = 'queued' AND next_attempt_at <= now())
          OR (status = 'sending' AND updated_at < now() - interval '15 minutes'))
      ORDER BY next_attempt_at
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING m.id, m.business_id, m.customer_id, m.type, m.to_address, m.reply_to, m.subject, m.payload, m.attempts
  `
  return rows.map((r: WsRow) => ({
    id: String(r.id),
    business_id: (r.business_id as string | null) ?? null,
    customer_id: (r.customer_id as string | null) ?? null,
    type: String(r.type),
    to_address: String(r.to_address),
    reply_to: (r.reply_to as string | null) ?? null,
    subject: (r.subject as string | null) ?? null,
    payload: (typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload) as Record<string, unknown>,
    attempts: Number(r.attempts),
  }))
}

async function invoiceAttachment(scope: Scope, businessId: string | null, invoiceId: unknown): Promise<{ filename: string; content: Buffer } | null> {
  if (typeof invoiceId !== 'string' || !UUID_RE.test(invoiceId) || !businessId) return null
  const ctx = { userId: 'system', accountId: scope.accountId, role: 'owner' as const }
  const [biz] = await wsDb(scope)`SELECT id, name, logo_url FROM ws.businesses WHERE account_id = ${scope.accountId} AND id = ${businessId}`
  if (!biz) return null
  const invoice = await getInvoice(ctx, { id: String(biz.id) }, invoiceId)
  if (!invoice) return null
  let content: Buffer
  if (invoice.hasPdf) {
    const [r] = await wsDb(scope)`SELECT encode(pdf_data, 'base64') AS data FROM ws.invoices WHERE account_id = ${scope.accountId} AND id = ${invoiceId}`
    content = Buffer.from(String(r?.data ?? ''), 'base64')
  } else {
    content = await renderInvoicePdf(invoice, { name: String(biz.name), logo: (biz.logo_url as string | null) ?? null })
  }
  return { filename: `faktura-${invoice.number}.pdf`.replace(/[^\w.-]/g, '-'), content }
}

/** Hromadná zpráva („Komu napsat“): souhlas se ověří až těsně před odesláním. */
export const isBulkType = (type: string): boolean => type.startsWith('outreach_')

async function stillContactable(scope: Scope, customerId: string | null): Promise<boolean> {
  if (!customerId) return false
  const [c] = await wsDb(scope)`
    SELECT 1 AS ok FROM ws.customers
    WHERE account_id = ${scope.accountId} AND id = ${customerId}
      AND contact_consent_at IS NOT NULL AND unsubscribed_at IS NULL AND ended_at IS NULL AND email IS NOT NULL`
  return Boolean(c)
}

async function settle(scope: Scope, m: Claimed, outcome: { sent: string } | { error: string; permanent: boolean } | { cancelled: 'expired' | 'no_consent' }) {
  if ('sent' in outcome) {
    // Po odeslání se obsah maže (osobní údaje) — zůstane předmět a příjemce.
    await wsDb(scope)`
      UPDATE ws.outbound_messages SET status = 'sent', sent_at = now(), provider_id = ${outcome.sent}, last_error = NULL,
        payload = payload - 'html' - 'text'
      WHERE account_id = ${scope.accountId} AND id = ${m.id}`
  } else if ('cancelled' in outcome) {
    await wsDb(scope)`
      UPDATE ws.outbound_messages SET status = 'cancelled', last_error = ${outcome.cancelled}, payload = payload - 'html' - 'text'
      WHERE account_id = ${scope.accountId} AND id = ${m.id}`
  } else {
    const last = outcome.permanent || m.attempts >= MAX_ATTEMPTS
    const wait = BACKOFF_MIN[Math.min(m.attempts - 1, BACKOFF_MIN.length - 1)]
    await wsDb(scope)`
      UPDATE ws.outbound_messages
      SET status = ${last ? 'failed' : 'queued'}, last_error = ${outcome.error.slice(0, 200)},
          next_attempt_at = now() + make_interval(mins => ${wait})
      WHERE account_id = ${scope.accountId} AND id = ${m.id}`
  }
}

export type FlushResult = { sent: number; failed: number; retried: number; expired: number }

/**
 * Odešle splatné zprávy účtu. Nikdy nevyhodí. `budgetMs` hlídá, aby akce
 * (nebo veřejné API) nečekala dlouho — co nestihne, pošle příště.
 */
export async function flushAccount(scope: Scope, opts: { budgetMs?: number; limit?: number; now?: () => number } = {}): Promise<FlushResult> {
  const out: FlushResult = { sent: 0, failed: 0, retried: 0, expired: 0 }
  const transport = getEmailTransport()
  if (!transport) return out
  const now = opts.now ?? Date.now
  const deadline = now() + (opts.budgetMs ?? 3000)
  const limit = opts.limit ?? 25
  try {
    let left = limit
    while (left > 0 && now() < deadline) {
      const batch = await claim(scope, Math.min(5, left))
      if (batch.length === 0) break
      left -= batch.length
      for (const m of batch) {
        try {
          const p = m.payload
          const validUntil = typeof p.validUntil === 'string' ? Date.parse(p.validUntil) : NaN
          if (!Number.isNaN(validUntil) && validUntil < now()) {
            await settle(scope, m, { cancelled: 'expired' })
            out.expired++
            continue
          }
          if (isBulkType(m.type) && !(await stillContactable(scope, m.customer_id))) {
            await settle(scope, m, { cancelled: 'no_consent' })
            out.expired++
            continue
          }
          const attachment = await invoiceAttachment(scope, m.business_id, p.invoiceId)
          if (p.invoiceId && !attachment) {
            await settle(scope, m, { error: 'invoice_missing', permanent: true })
            out.failed++
            continue
          }
          const unsub = typeof p.unsubscribeUrl === 'string' ? p.unsubscribeUrl : null
          const email: OutgoingEmail = {
            id: m.id,
            fromName: typeof p.fromName === 'string' ? p.fromName : 'ZakazIQ',
            to: m.to_address,
            replyTo: m.reply_to,
            subject: m.subject ?? '',
            html: String(p.html ?? ''),
            text: String(p.text ?? ''),
            attachments: attachment ? [attachment] : [],
            headers: unsub ? { 'List-Unsubscribe': `<${unsub}/jedno-kliknuti>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } : {},
            tags: [
              { name: 'account', value: scope.accountId },
              { name: 'message', value: m.id },
              { name: 'type', value: m.type.replace(/[^\w-]/g, '_').slice(0, 50) },
            ],
          }
          const res = await transport.send(email)
          if (res.ok) {
            await settle(scope, m, { sent: res.providerId })
            out.sent++
          } else {
            await settle(scope, m, { error: res.error, permanent: res.permanent })
            if (res.permanent || m.attempts >= MAX_ATTEMPTS) out.failed++
            else out.retried++
          }
        } catch (e) {
          await settle(scope, m, { error: e instanceof Error ? `app:${e.name}` : 'app', permanent: false }).catch(() => undefined)
          out.retried++
        }
      }
    }
  } catch (e) {
    console.error('ws.email.flush', { accountId: scope.accountId, error: e instanceof Error ? e.message : 'unknown' })
  }
  return out
}

/** Denní cron: všechny účty se splatnými zprávami. */
export async function flushAll(opts: { budgetMs?: number } = {}): Promise<FlushResult & { accounts: number }> {
  const accounts = await wsSystem<{ account_id: string }>`SELECT account_id FROM ws.accounts_with_due_messages()`
  const total = { sent: 0, failed: 0, retried: 0, expired: 0, accounts: accounts.length }
  const deadline = Date.now() + (opts.budgetMs ?? 40_000)
  for (const a of accounts) {
    const left = deadline - Date.now()
    if (left <= 0) break
    const r = await flushAccount({ accountId: a.account_id }, { budgetMs: left, limit: 200 })
    total.sent += r.sent
    total.failed += r.failed
    total.retried += r.retried
    total.expired += r.expired
  }
  return total
}
