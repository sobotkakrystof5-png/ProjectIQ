import 'server-only'
import { q, wsDb, type WsRow } from '../db'
import type { WsBusiness, WsContext } from '../context'
import { ALWAYS_ON_MODULES } from '../templates/types'
import { fillTemplate, isMessageType, MESSAGE_TYPES, MESSAGES, SAMPLE_VALUES, type MessageType } from './catalog'
import { previewCustomerEmail } from './compose'
import { renderEmail } from './layout'
import { emailFromAddress } from './transport'
import { enqueueEmail, flushAccount } from './queue'

// Nastavení › E-maily a upozornění (S15): zapnout/vypnout každý typ,
// upravit text zákaznických e-mailů, kam chodí odpovědi, novinky ZakazIQ.
// Chybějící řádek ws.message_settings = výchozí stav a text z catalog.ts.

const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/

export type EmailSettingRow = {
  type: MessageType
  enabled: boolean
  subject: string | null
  body: string | null
}

export type EmailSettingsData = {
  rows: EmailSettingRow[]
  replyTo: string | null
  ownerEmail: string | null
  myEmail: string | null
  newsEmails: boolean
  /** Odesílání je nastavené (doména ověřená, WS_EMAIL_FROM). */
  sendingReady: boolean
}

export async function getEmailSettings(ctx: WsContext, business: Pick<WsBusiness, 'id' | 'settings'>): Promise<EmailSettingsData> {
  const acc = ctx.accountId
  const [settings, modules, owners, me, account] = await wsDb(ctx).batch([
    q`SELECT type, enabled, subject, body FROM ws.message_settings WHERE account_id = ${acc} AND business_id = ${business.id}`,
    q`SELECT module FROM ws.business_modules WHERE account_id = ${acc} AND business_id = ${business.id} AND enabled`,
    q`SELECT email FROM ws.members WHERE account_id = ${acc} AND role = 'owner' AND email IS NOT NULL ORDER BY created_at LIMIT 1`,
    q`SELECT email FROM ws.members WHERE account_id = ${acc} AND clerk_user_id = ${ctx.userId}`,
    q`SELECT news_emails FROM ws.accounts WHERE id = ${acc}`,
  ])
  const on = new Set<string>([...modules.map((m: WsRow) => String(m.module)), ...ALWAYS_ON_MODULES])
  const saved = new Map(settings.filter((r: WsRow) => isMessageType(r.type)).map((r: WsRow) => [r.type as MessageType, r]))
  const rows = MESSAGE_TYPES.filter((t) => !MESSAGES[t].needs || on.has(MESSAGES[t].needs!)).map((type) => {
    const r = saved.get(type)
    return {
      type,
      enabled: r ? Boolean(r.enabled) : true,
      subject: (r?.subject as string | null) ?? null,
      body: (r?.body as string | null) ?? null,
    }
  })
  const replyTo = typeof business.settings?.reply_to === 'string' ? business.settings.reply_to : null
  return {
    rows,
    replyTo,
    ownerEmail: owners[0] ? String(owners[0].email) : null,
    myEmail: me[0]?.email ? String(me[0].email) : null,
    newsEmails: account[0] ? Boolean(account[0].news_emails) : true,
    sendingReady: Boolean(emailFromAddress() && process.env.RESEND_API_KEY),
  }
}

/** Uloží stav a text typu. Text shodný s výchozím (nebo prázdný) se ukládá jako null = výchozí. */
export async function saveMessageSetting(
  ctx: WsContext,
  business: Pick<WsBusiness, 'id'>,
  input: { type: MessageType; enabled: boolean; subject: string | null; body: string | null },
): Promise<void> {
  const def = MESSAGES[input.type]
  const subject = def.editable && input.subject?.trim() && input.subject.trim() !== def.subject ? input.subject.trim() : null
  const body = def.editable && input.body?.trim() && input.body.trim() !== def.body ? input.body.trim() : null
  await wsDb(ctx)`
    INSERT INTO ws.message_settings (account_id, business_id, type, enabled, subject, body)
    VALUES (${ctx.accountId}, ${business.id}, ${input.type}, ${input.enabled}, ${subject}, ${body})
    ON CONFLICT (business_id, type) DO UPDATE SET enabled = EXCLUDED.enabled, subject = EXCLUDED.subject, body = EXCLUDED.body
    WHERE ws.message_settings.account_id = ${ctx.accountId}`
}

/** Kam chodí odpovědi zákazníků (null = e-mail majitele). */
export async function saveReplyTo(ctx: WsContext, business: Pick<WsBusiness, 'id'>, email: string | null): Promise<void> {
  if (email && !EMAIL_RE.test(email)) throw new Error('reply_to_invalid')
  await wsDb(ctx)`
    UPDATE ws.businesses
    SET settings = CASE WHEN ${email}::text IS NULL THEN settings - 'reply_to' ELSE settings || jsonb_build_object('reply_to', ${email}::text) END
    WHERE account_id = ${ctx.accountId} AND id = ${business.id}`
}

export async function saveNewsEmails(ctx: WsContext, enabled: boolean): Promise<void> {
  await wsDb(ctx)`UPDATE ws.accounts SET news_emails = ${enabled} WHERE id = ${ctx.accountId}`
}

/**
 * Zkušební e-mail na adresu přihlášeného člena: přesně to, co by dostal
 * zákazník (s ukázkovými údaji). Nejvýš jeden za minutu a typ.
 */
export async function sendTestEmail(
  ctx: WsContext,
  business: Pick<WsBusiness, 'id' | 'name' | 'color'>,
  input: { type: MessageType; subject: string | null; body: string | null },
  to: string,
): Promise<'queued' | 'sent' | 'too_soon'> {
  const def = MESSAGES[input.type]
  const email =
    def.audience === 'customer'
      ? previewCustomerEmail({ type: input.type, brand: { name: business.name, color: business.color }, subject: input.subject, body: input.body })
      : renderEmail({
          brand: { name: business.name, color: business.color },
          subject: fillTemplate(def.subject, SAMPLE_VALUES),
          body: `Takhle vypadá upozornění „${def.label}“. Skutečný e-mail ponese údaje z vaší aplikace.`,
          footer: 'Zkušební e-mail z Nastavení › E-maily a upozornění.',
        })
  const minute = new Date().toISOString().slice(0, 16)
  const id = await enqueueEmail(ctx, {
    businessId: business.id,
    type: `test_${input.type}`,
    to,
    replyTo: null,
    fromName: business.name,
    email: { ...email, subject: `Zkouška: ${email.subject}` },
    dedupeKey: `test:${input.type}:${to}:${minute}`,
  })
  if (!id) return 'too_soon'
  const r = await flushAccount(ctx, { budgetMs: 4000, limit: 3 })
  return r.sent > 0 ? 'sent' : 'queued'
}
