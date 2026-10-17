import 'server-only'
import { createAccountWithBusiness } from '../onboarding'
import { WS_SIGN_UP_PATH } from '../paths'
import type { IndustryKey } from '../templates'
import { type AdminIdentity } from './auth'
import { auditAdmin } from './clients'

// „Pozvat klienta“ z /dashboard/klienti (S17, R-052). Admin klientovi založí
// organizaci v Clerku, účet a byznys ze šablony oboru (stejná transakce jako
// průvodce /w/novy, jen bez vlastníka) a pošle pozvánku e-mailem z Clerku.
// Klient se zaregistruje z pozvánky, stane se vlastníkem (org:admin) a průvodce
// ho pošle rovnou na krok 2 (předplatné, R-038) — účet už nezakládá.

export type InviteClerk = {
  createOrganization(name: string): Promise<{ id: string }>
  inviteOwner(orgId: string, email: string, redirectUrl: string): Promise<{ id: string }>
  deleteOrganization(orgId: string): Promise<void>
}

const realClerk: InviteClerk = {
  async createOrganization(name) {
    const { clerkClient } = await import('@clerk/nextjs/server')
    const clerk = await clerkClient()
    const org = await clerk.organizations.createOrganization({ name })
    return { id: org.id }
  },
  async inviteOwner(orgId, email, redirectUrl) {
    const { clerkClient } = await import('@clerk/nextjs/server')
    const clerk = await clerkClient()
    const inv = await clerk.organizations.createOrganizationInvitation({
      organizationId: orgId,
      emailAddress: email,
      role: 'org:admin',
      redirectUrl,
    })
    return { id: inv.id }
  },
  async deleteOrganization(orgId) {
    const { clerkClient } = await import('@clerk/nextjs/server')
    const clerk = await clerkClient()
    await clerk.organizations.deleteOrganization(orgId)
  },
}

let clerk: InviteClerk = realClerk

/** Jen pro testy. `null` vrátí skutečný Clerk. */
export function setInviteClerkForTests(next: InviteClerk | null): void {
  clerk = next ?? realClerk
}

/** Kam pozvánka vede: registrace Workspace (Clerk si přidá __clerk_ticket). */
export function inviteRedirectUrl(): string {
  const origin = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.zakaziq.cz').replace(/\/+$/, '')
  return `${origin}${WS_SIGN_UP_PATH}`
}

export type InviteInput = { email: string; businessName: string; industry: IndustryKey }

export type InviteResult =
  | { status: 'invited'; accountId: string }
  /** Účet je založený, jen pozvánka neodešla — jde poslat znovu z detailu. */
  | { status: 'invite_failed'; accountId: string }

/** Chyba Clerku před založením účtu (nic nevzniklo). */
export class InviteSetupError extends Error {}

export async function inviteClient(admin: AdminIdentity, input: InviteInput): Promise<InviteResult> {
  let orgId: string
  try {
    orgId = (await clerk.createOrganization(input.businessName)).id
  } catch (e) {
    throw new InviteSetupError(e instanceof Error ? e.message : 'clerk')
  }

  let accountId: string
  try {
    ;({ accountId } = await createAccountWithBusiness({ orgId, name: input.businessName, industry: input.industry, owner: null }))
  } catch (e) {
    // Organizace bez účtu by se při registraci klienta jinou cestou použila
    // jako „spadlé založení“ — radši ji smazat.
    await clerk.deleteOrganization(orgId).catch(() => undefined)
    throw e
  }

  await auditAdmin(admin, {
    accountId,
    action: 'admin.account_created',
    entity: 'account',
    entityId: accountId,
    details: { industry: input.industry },
  })

  const sent = await sendInvite(admin, accountId, orgId, input.email)
  return sent ? { status: 'invited', accountId } : { status: 'invite_failed', accountId }
}

/** Pozvánka vlastníka do existujícího účtu (i opakovaně). Vrací false, když ji Clerk odmítl. */
export async function sendInvite(admin: AdminIdentity, accountId: string, orgId: string, email: string): Promise<boolean> {
  try {
    await clerk.inviteOwner(orgId, email, inviteRedirectUrl())
  } catch (e) {
    console.error('admin.invite', { accountId, error: e instanceof Error ? e.message : 'unknown' })
    return false
  }
  // E-mail klienta do auditu nepíšeme (audit čte i klient) — jen doménu.
  await auditAdmin(admin, { accountId, action: 'admin.invite_sent', entity: 'account', entityId: accountId, details: { domain: email.split('@')[1] ?? null } })
  return true
}
