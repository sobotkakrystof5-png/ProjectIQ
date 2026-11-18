import 'server-only'
import { sql } from '@/lib/db'
import { adminDb, q } from '@/lib/admin/db'
import { sendVizeonMail, type SendResult, type VizeonMail } from '@/lib/admin/vizeon-mail'
import { createNotification } from '@/lib/notifications'
import { renderPortalInviteEmail } from '@/lib/portal/invite-email'

// Klientský prostor z pohledu jedné zakázky (KP11, R-121). Admin čte a píše
// vlastníkem tabulek (`lib/db`), stejně jako `app/portal-admin-actions.ts`;
// role `portal_app` se tu nepoužívá.

export type ProjectPortalAccess = {
  /** `false`, když databáze nemá schéma `portal` (migrace 095 chybí). */
  available: boolean
  client: { id: string; name: string } | null
  members: { id: string; name: string | null; email: string | null; since: string }[]
  pending: { id: string; email: string; createdAt: string; expiresAt: string }[]
}

const iso = (v: unknown): string => new Date(v as string | Date).toISOString()

function missingSchema(err: unknown): boolean {
  const code = (err as { code?: string }).code
  return code === '42P01' || code === '3F000'
}

/**
 * Jedna dávka, jeden požadavek do databáze (R-092): klient zakázky, jeho členové
 * a čekající pozvánky. Chyba čtení nesmí shodit detail zakázky, proto se tu
 * chytá a karta se pak jen neukáže.
 */
export async function loadProjectPortalAccess(projectId: string): Promise<ProjectPortalAccess | null> {
  try {
    const [clients, members, pending] = await adminDb.batch([
      q`SELECT c.id, c.name FROM portal.projects p JOIN portal.clients c ON c.id = p.client_id WHERE p.id = ${projectId}`,
      q`SELECT id, name, email, created_at FROM portal.members
        WHERE client_id = (SELECT client_id FROM portal.projects WHERE id = ${projectId}) AND removed_at IS NULL ORDER BY created_at`,
      q`SELECT id, email, created_at, expires_at FROM portal.invites
        WHERE client_id = (SELECT client_id FROM portal.projects WHERE id = ${projectId}) AND used_at IS NULL AND revoked_at IS NULL AND expires_at > now()
        ORDER BY created_at DESC`,
    ])
    const client = clients[0] as { id: string; name: string } | undefined
    if (!client) return { available: true, client: null, members: [], pending: [] }
    return {
      available: true,
      client: { id: String(client.id), name: String(client.name) },
      members: (members as { id: string; name: string | null; email: string | null; created_at: unknown }[]).map((m) => ({
        id: String(m.id),
        name: m.name,
        email: m.email,
        since: iso(m.created_at),
      })),
      pending: (pending as { id: string; email: string; created_at: unknown; expires_at: unknown }[]).map((i) => ({
        id: String(i.id),
        email: String(i.email),
        createdAt: iso(i.created_at),
        expiresAt: iso(i.expires_at),
      })),
    }
  } catch (err) {
    if (missingSchema(err)) return { available: false, client: null, members: [], pending: [] }
    console.error('[portal] stav prostoru u zakázky se nenačetl:', err instanceof Error ? err.name : 'unknown')
    return null
  }
}

export type PortalInviteDelivery = {
  mode: 'invite' | 'new_project'
  projectId: string
  clientId: string
  /** Jen u `invite`. */
  inviteId: string | null
  email: string
  /** Obsahuje kód pozvánky — nikam se neukládá ani nepíše do logu. */
  url: string
  projectTitle: string
  expiresAt: Date | null
}

type Sender = (mail: VizeonMail) => Promise<SendResult>

/**
 * Pošle pozvánku, pokud ji mezitím nikdo nevzal zpět. Volá se po odkladu na
 * „Zpět" (`after()` v akci), proto se stav čte z databáze znovu: zrušená
 * pozvánka nebo zakázka odpojená od klienta = nic neodejde.
 */
export async function deliverPortalInvite(
  job: PortalInviteDelivery,
  send: Sender = sendVizeonMail,
): Promise<'sent' | 'cancelled' | 'failed'> {
  const still =
    job.mode === 'invite'
      ? await sql`
          SELECT 1 FROM portal.invites i
          JOIN portal.projects p ON p.client_id = i.client_id AND p.id = ${job.projectId}
          WHERE i.id = ${job.inviteId} AND i.used_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > now()
        `
      : await sql`SELECT 1 FROM portal.projects WHERE id = ${job.projectId} AND client_id = ${job.clientId}`
  if (!still.length) return 'cancelled'

  let result: SendResult
  try {
    const mail =
      job.mode === 'invite'
        ? renderPortalInviteEmail({
            kind: 'invite',
            projectTitle: job.projectTitle,
            url: job.url,
            expiresAt: job.expiresAt ?? new Date(),
          })
        : renderPortalInviteEmail({ kind: 'new_project', projectTitle: job.projectTitle, url: job.url })
    result = await send({
      to: job.email,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      // Stejná pozvánka podruhé neodejde, ani kdyby se `after()` spustil dvakrát.
      idempotencyKey: job.mode === 'invite' ? `portal-invite-${job.inviteId}` : `portal-project-${job.projectId}-${job.clientId}`,
    })
  } catch (err) {
    result = { ok: false, error: err instanceof Error ? err.message : 'neznámá chyba' }
  }
  if (result.ok) return 'sent'

  console.error('[portal] pozvánka neodešla:', result.error)
  await createNotification({
    type: 'portal_invite_failed',
    title: 'Pozvánka do prostoru neodešla',
    body: `E-mail pro ${job.email} se nepodařilo odeslat. Pošlete pozvánku znovu, nebo klientovi pošlete odkaz sami.`,
    link: `/dashboard/${job.projectId}`,
  })
  return 'failed'
}
