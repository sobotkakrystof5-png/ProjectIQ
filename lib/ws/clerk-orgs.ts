import 'server-only'
import { clerkClient } from '@clerk/nextjs/server'
import { accountIdForOrg } from './onboarding'

// Organizace Clerku přihlášeného uživatele vzhledem k účtům ve ws (S07).

type Membership = { orgId: string; role: string }

async function membershipsOf(userId: string): Promise<Membership[]> {
  const clerk = await clerkClient()
  const { data } = await clerk.users.getOrganizationMembershipList({ userId, limit: 100 })
  return data.map((m) => ({ orgId: m.organization.id, role: m.role }))
}

/**
 * Organizace, která už má účet. Po přihlášení nemusí být aktivní (Clerk ji
 * nevybere sám) — průvodce ji pak jen aktivuje místo zakládání nového účtu.
 */
export async function orgWithAccount(userId: string): Promise<string | null> {
  for (const m of await membershipsOf(userId)) {
    if (await accountIdForOrg(m.orgId)) return m.orgId
  }
  return null
}

/**
 * Organizace pro nový účet: existující s účtem (nový se nezakládá, R-026),
 * jinak vlastní organizace bez účtu (založení dřív spadlo napůl), jinak nová.
 */
export async function orgForNewAccount(
  userId: string,
  name: string,
): Promise<{ orgId: string; hasAccount: boolean }> {
  const memberships = await membershipsOf(userId)
  for (const m of memberships) {
    if (await accountIdForOrg(m.orgId)) return { orgId: m.orgId, hasAccount: true }
  }
  const clerk = await clerkClient()
  const orphan = memberships.find((m) => m.role === 'org:admin')
  if (orphan) {
    await clerk.organizations.updateOrganization(orphan.orgId, { name })
    return { orgId: orphan.orgId, hasAccount: false }
  }
  const org = await clerk.organizations.createOrganization({ name, createdBy: userId })
  return { orgId: org.id, hasAccount: false }
}

/** Jméno a e-mail vlastníka pro ws.members. */
export async function ownerProfile(userId: string): Promise<{ name: string | null; email: string | null }> {
  const clerk = await clerkClient()
  const user = await clerk.users.getUser(userId)
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || null
  return { name, email: user.primaryEmailAddress?.emailAddress ?? null }
}
