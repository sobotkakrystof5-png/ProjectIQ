import 'server-only'
import { sendVizeonMail, type VizeonMail } from '@/lib/admin/vizeon-mail'
import { q, wsDb } from '../db'
import { generateWsInviteCode, wsInviteExpiry } from '../invite'
import { createAccountWithBusiness } from '../onboarding'
import { WS_INVITE_PATH } from '../paths'
import type { IndustryKey } from '../templates'
import { type AdminIdentity } from './auth'
import { auditAdmin } from './clients'
import { renderWsInviteEmail } from './invite-email'

// „Pozvat klienta“ z /dashboard/klienti (S17, R-052; od R-154 bez Clerku).
// Admin klientovi založí účet a byznys ze šablony oboru (stejná transakce jako
// průvodce /w/novy, jen bez vlastníka) a pošle mu e-mailem pozvánku s kódem.
// Klient si z ní nastaví přístup (nebo se přihlásí účtem z klientského
// prostoru), stane se vlastníkem a průvodce ho pošle rovnou na předplatné (R-038).

export type InviteMailer = (mail: VizeonMail) => Promise<{ ok: boolean }>

let mailer: InviteMailer = sendVizeonMail

/** Jen pro testy. `null` vrátí skutečné odesílání. */
export function setInviteMailerForTests(next: InviteMailer | null): void {
  mailer = next ?? sendVizeonMail
}

function appOrigin(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.zakaziq.cz').replace(/\/+$/, '')
}

/** Odkaz z e-mailu: /w/pozvanka/<kód>. */
export const inviteUrl = (code: string): string => `${appOrigin()}${WS_INVITE_PATH}/${code}`

export type InviteInput = { email: string; businessName: string; industry: IndustryKey }

export type InviteResult =
  | { status: 'invited'; accountId: string }
  /** Účet je založený, jen pozvánka neodešla — jde poslat znovu z detailu. */
  | { status: 'invite_failed'; accountId: string }

export async function inviteClient(admin: AdminIdentity, input: InviteInput): Promise<InviteResult> {
  const { accountId } = await createAccountWithBusiness({ name: input.businessName, industry: input.industry, owner: null })

  await auditAdmin(admin, {
    accountId,
    action: 'admin.account_created',
    entity: 'account',
    entityId: accountId,
    details: { industry: input.industry },
  })

  const sent = await sendInvite(admin, accountId, input.email)
  return sent ? { status: 'invited', accountId } : { status: 'invite_failed', accountId }
}

/**
 * Pozvánka vlastníka do existujícího účtu (i opakovaně). Předchozí nevyužité
 * pozvánky účtu zneplatní, ať platí jen ta poslední. Vrací false, když e-mail neodešel.
 */
export async function sendInvite(admin: AdminIdentity, accountId: string, email: string): Promise<boolean> {
  const to = email.trim().toLowerCase()
  let code: string
  let expiresAt: Date
  let businessName: string
  try {
    const generated = generateWsInviteCode()
    code = generated.code
    expiresAt = wsInviteExpiry()
    const db = wsDb({ accountId })
    const [, , rows] = await db.batch([
      q`UPDATE ws.account_invites SET revoked_at = now() WHERE account_id = ${accountId} AND used_at IS NULL AND revoked_at IS NULL`,
      q`
        INSERT INTO ws.account_invites (account_id, email, code_hash, role, expires_at)
        VALUES (${accountId}, ${to}, ${generated.hash}, 'owner', ${expiresAt})`,
      q`SELECT name FROM ws.businesses WHERE account_id = ${accountId} AND archived_at IS NULL ORDER BY created_at LIMIT 1`,
    ])
    businessName = String((rows[0] as { name?: unknown } | undefined)?.name ?? 'vaši firmu')
  } catch (e) {
    console.error('admin.invite', { accountId, error: e instanceof Error ? e.message : 'unknown' })
    return false
  }

  try {
    const mail = renderWsInviteEmail({ businessName, url: inviteUrl(code), expiresAt })
    const res = await mailer({ to, subject: mail.subject, text: mail.text, html: mail.html })
    if (!res.ok) return false
  } catch (e) {
    console.error('admin.invite', { accountId, error: e instanceof Error ? e.message : 'unknown' })
    return false
  }
  // E-mail klienta do auditu nepíšeme (audit čte i klient) — jen doménu.
  await auditAdmin(admin, { accountId, action: 'admin.invite_sent', entity: 'account', entityId: accountId, details: { domain: to.split('@')[1] ?? null } })
  return true
}
