import 'server-only'
import { randomUUID } from 'crypto'
import { ACCOUNT_INVITE_VALID_DAYS, generateAccountInviteCode, invitePepper } from '../invite-code'
import { createAccountWithBusiness } from '../onboarding'
import { WS_INVITE_PATH } from '../paths'
import type { IndustryKey } from '../templates'
import { type AdminIdentity } from './auth'
import { auditAdmin } from './clients'
import { adminDb } from './db'

// „Pozvat klienta“ z /dashboard/klienti (S17, R-052; od R-080 bez Clerku).
// Admin klientovi založí účet a byznys ze šablony oboru (stejná transakce jako
// průvodce /w/novy, jen bez vlastníka) a pošle pozvánku e-mailem:
//
//   1. v ws.account_invites je jen HMAC hash jednorázového kódu (WS_KEY_PEPPER),
//   2. odkaz v e-mailu klienta rovnou přihlásí (Supabase Auth: nový účet =
//      pozvánka, existující = přihlašovací odkaz) a vede na /w/pozvanka/<kód>,
//   3. tam se kód uplatní (ws.redeem_account_invite) — klient se stane
//      vlastníkem a průvodce ho pošle na krok 2 (předplatné, R-038).
//
// Přihlašovací odkaz vytvoří Supabase, e-mail posíláme sami (Resend, vzhled
// Dílků) — nezávisle na e-mailových šablonách v Supabase.

export { ACCOUNT_INVITE_VALID_DAYS, hashAccountInviteCode, InviteConfigError, isAccountInviteCode } from '../invite-code'

const appOrigin = () => (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.zakaziq.cz').replace(/\/+$/, '')

/** Kam pozvánka vede po přihlášení: stránka, která kód uplatní. */
export const invitePagePath = (code: string) => `${WS_INVITE_PATH}/${code}`

/**
 * Přihlášení a odeslání pozvánky. Za rozhraním, aby testy nic neposílaly ven.
 * `sendInvite` vrací false, když e-mail neodešel (chybí konfigurace, odmítnutí).
 */
export type InviteDelivery = {
  sendInvite(input: { email: string; businessName: string; nextPath: string }): Promise<boolean>
}

const realDelivery: InviteDelivery = {
  async sendInvite({ email, businessName, nextPath }) {
    const [{ supabaseAdmin }, { getEmailTransport }, { renderEmail }] = await Promise.all([
      import('@/lib/supabase/admin'),
      import('../email/transport'),
      import('../email/layout'),
    ])
    const transport = getEmailTransport()
    if (!transport) {
      console.error('admin.invite: e-mail nejde poslat (chybí WS_EMAIL_FROM nebo RESEND_API_KEY)')
      return false
    }

    // Nový člověk = pozvánka (vytvoří uživatele), existující = přihlašovací odkaz.
    const auth = supabaseAdmin().auth.admin
    let link = await auth.generateLink({ type: 'invite', email })
    let type: 'invite' | 'magiclink' = 'invite'
    if (link.error && (link.error.code === 'email_exists' || link.error.status === 422)) {
      link = await auth.generateLink({ type: 'magiclink', email })
      type = 'magiclink'
    }
    const tokenHash = link.data?.properties?.hashed_token
    if (link.error || !tokenHash) {
      console.error('admin.invite: Supabase odkaz nevytvořil', { code: link.error?.code ?? 'no_token' })
      return false
    }
    const url = new URL('/auth/callback', appOrigin())
    url.searchParams.set('token_hash', tokenHash)
    url.searchParams.set('type', type)
    url.searchParams.set('next', nextPath)

    const rendered = renderEmail({
      brand: { name: 'ZakazIQ', color: null },
      subject: `Pozvánka do ZakazIQ: ${businessName}`,
      body:
        `Dobrý den,\n\npřipravili jsme vám v ZakazIQ účet pro ${businessName}. ` +
        'Tlačítkem níže se přihlásíte a účet si převezmete.\n\n' +
        `Odkaz platí ${ACCOUNT_INVITE_VALID_DAYS} dní a jde použít jen jednou.`,
      blocks: [{ kind: 'buttons', items: [{ label: 'Převzít účet', url: url.toString(), primary: true }] }],
      footer: 'Tenhle e-mail jste dostali, protože vám v ZakazIQ někdo připravil účet. Pokud o něm nic nevíte, nemusíte nic dělat.',
    })
    const sent = await transport.send({
      id: randomUUID(),
      fromName: 'ZakazIQ',
      to: email,
      replyTo: null,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      attachments: [],
      headers: {},
      tags: [{ name: 'type', value: 'account_invite' }],
    })
    if (!sent.ok) console.error('admin.invite: e-mail neodešel', { error: sent.error })
    return sent.ok
  },
}

let delivery: InviteDelivery = realDelivery

/** Jen pro testy. `null` vrátí skutečné odesílání. */
export function setInviteDeliveryForTests(next: InviteDelivery | null): void {
  delivery = next ?? realDelivery
}

export type InviteInput = { email: string; businessName: string; industry: IndustryKey }

export type InviteResult =
  | { status: 'invited'; accountId: string }
  /** Účet je založený, jen pozvánka neodešla — jde poslat znovu z detailu. */
  | { status: 'invite_failed'; accountId: string }

export async function inviteClient(admin: AdminIdentity, input: InviteInput): Promise<InviteResult> {
  // Bez pepře by pozvánka nešla uplatnit — radši nic nezakládat.
  invitePepper()

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
 * Pozvánka vlastníka do existujícího účtu (i opakovaně). Předchozí nepoužité
 * pozvánky účtu se zruší, platí jen poslední. Vrací false, když e-mail neodešel.
 */
export async function sendInvite(admin: AdminIdentity, accountId: string, email: string): Promise<boolean> {
  const { code, hash } = generateAccountInviteCode()
  const [business] = await adminDb<{ name: string }>`
    SELECT name FROM ws.businesses WHERE account_id = ${accountId} AND archived_at IS NULL ORDER BY created_at LIMIT 1
  `
  await adminDb.batch([
    {
      text: `UPDATE ws.account_invites SET revoked_at = now() WHERE account_id = $1 AND used_at IS NULL AND revoked_at IS NULL`,
      params: [accountId],
    },
    {
      text: `INSERT INTO ws.account_invites (account_id, email, role, code_hash, expires_at)
             VALUES ($1, $2, 'owner', $3, now() + make_interval(days => $4))`,
      params: [accountId, email, hash, ACCOUNT_INVITE_VALID_DAYS],
    },
  ])

  let sent = false
  try {
    sent = await delivery.sendInvite({ email, businessName: business?.name ?? 'váš byznys', nextPath: invitePagePath(code) })
  } catch (e) {
    console.error('admin.invite', { accountId, error: e instanceof Error ? e.message : 'unknown' })
  }
  if (!sent) return false
  // E-mail klienta do auditu nepíšeme (audit čte i klient) — jen doménu.
  await auditAdmin(admin, { accountId, action: 'admin.invite_sent', entity: 'account', entityId: accountId, details: { domain: email.split('@')[1] ?? null } })
  return true
}
