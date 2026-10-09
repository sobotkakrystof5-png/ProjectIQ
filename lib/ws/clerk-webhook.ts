import type { WebhookEvent } from '@clerk/nextjs/webhooks'
import { wsDb, wsSystem } from './db'
import { accountIdForOrg } from './onboarding'

// Zpracování událostí z Clerku (/api/clerk/webhook, S07). Podpis ověřuje route
// handler, sem jde jen ověřená událost a její svix-id.
//
// Účet zakládá průvodce /w/novy (účet bez byznysu nedává smysl), webhook jen
// drží v souladu název účtu a členy. Událost k organizaci bez účtu se přeskočí
// — vlastníka zapíše průvodce sám.
//
// Idempotence: svix-id v ws.webhook_events. Hotová událost (processed_at) se
// přeskočí; nedokončená (spadla uprostřed) se zpracuje znovu — všechny zápisy
// jsou upsert nebo delete, opakování nic nezdvojí.

export type ClerkEventResult = 'processed' | 'duplicate' | 'ignored'

const roleFor = (clerkRole: string): 'owner' | 'staff' => (clerkRole === 'org:admin' ? 'owner' : 'staff')

const fullName = (first: string | null, last: string | null): string | null =>
  [first, last].filter(Boolean).join(' ').trim() || null

export async function handleClerkEvent(evt: WebhookEvent, eventId: string): Promise<ClerkEventResult> {
  const [row] = await wsSystem<{ processed_at: Date | null }>`
    INSERT INTO ws.webhook_events (source, id, type) VALUES ('clerk', ${eventId}, ${evt.type})
    ON CONFLICT (source, id) DO UPDATE SET type = EXCLUDED.type
    RETURNING processed_at
  `
  if (row?.processed_at) return 'duplicate'

  const result = await apply(evt)

  await wsSystem`UPDATE ws.webhook_events SET processed_at = now() WHERE source = 'clerk' AND id = ${eventId}`
  return result
}

async function apply(evt: WebhookEvent): Promise<ClerkEventResult> {
  switch (evt.type) {
    case 'organization.updated': {
      const accountId = await accountIdForOrg(evt.data.id)
      if (!accountId) return 'ignored'
      await wsDb({ accountId })`UPDATE ws.accounts SET name = ${evt.data.name} WHERE id = ${accountId}`
      return 'processed'
    }

    case 'organizationMembership.created':
    case 'organizationMembership.updated': {
      const { organization, public_user_data: user, role } = evt.data
      const accountId = await accountIdForOrg(organization.id)
      if (!accountId) return 'ignored'
      await wsDb({ accountId })`
        INSERT INTO ws.members (account_id, clerk_user_id, role, name, email)
        VALUES (${accountId}, ${user.user_id}, ${roleFor(role)}, ${fullName(user.first_name, user.last_name)}, ${user.identifier || null})
        ON CONFLICT (account_id, clerk_user_id) DO UPDATE
          SET role = EXCLUDED.role, name = EXCLUDED.name, email = EXCLUDED.email
      `
      return 'processed'
    }

    case 'organizationMembership.deleted': {
      const { organization, public_user_data: user } = evt.data
      const accountId = await accountIdForOrg(organization.id)
      if (!accountId) return 'ignored'
      await wsDb({ accountId })`
        DELETE FROM ws.members WHERE account_id = ${accountId} AND clerk_user_id = ${user.user_id}
      `
      return 'processed'
    }

    // organization.deleted: data účtu se nikdy nemažou samy (AGENTS.md B5, „Nikdy“).
    // Smazání účtu je GDPR výmaz na žádost (S18). user.deleted pokryjí události
    // organizationMembership.deleted. Ostatní události Workspace nepotřebuje.
    default:
      return 'ignored'
  }
}
