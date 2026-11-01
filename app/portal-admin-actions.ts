'use server'

import { revalidatePath } from 'next/cache'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions, requireAuth } from '@/lib/auth'
import { sql } from '@/lib/db'
import { generateInviteCode, inviteExpiry, InviteConfigError } from '@/lib/portal/invite'

// Správa klientských prostorů z adminu (KP05). Běží vlastníkem tabulek (lib/db),
// ne rolí portal_app. Každá akce začíná requireAuth().

type Result<T = object> = ({ success: true } & T) | { success: false; error: string }

const idSchema = z.string().uuid()
const nameSchema = z.string().trim().min(1, 'Napište prosím název firmy.').max(200, 'Název může mít nejvýše 200 znaků.')
const emailSchema = z.string().trim().toLowerCase().email('Zadejte platný e-mail.').max(320)

const PATH = '/dashboard/klientsky-prostor'

async function adminEmail(): Promise<string> {
  return (await getServerSession(authOptions))?.user?.email ?? 'admin'
}

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || '').replace(/\/+$/, '')
}

export async function createPortalClient(name: string): Promise<Result<{ id: string }>> {
  await requireAuth()
  const parsed = nameSchema.safeParse(name)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const rows = await sql`INSERT INTO portal.clients (name) VALUES (${parsed.data}) RETURNING id`
  revalidatePath(PATH)
  return { success: true, id: String((rows[0] as { id: string }).id) }
}

export async function linkProjectToClient(clientId: string, projectId: string): Promise<Result> {
  await requireAuth()
  const c = idSchema.safeParse(clientId)
  const p = idSchema.safeParse(projectId)
  if (!c.success || !p.success) return { success: false, error: 'Neplatná data.' }
  try {
    await sql`SELECT portal.link_project(${c.data}, ${p.data})`
  } catch (err) {
    const code = (err as { code?: string }).code
    if (code === '23505') return { success: false, error: 'Zakázka už patří jinému klientovi.' }
    if (code === 'P0002') return { success: false, error: 'Zakázka nebyla nalezena.' }
    console.error('[portal] propojení zakázky selhalo:', err instanceof Error ? err.name : 'unknown')
    return { success: false, error: 'Zakázku se nepodařilo propojit.' }
  }
  revalidatePath(`${PATH}/${c.data}`)
  return { success: true }
}

export async function unlinkProject(clientId: string, projectId: string): Promise<Result> {
  await requireAuth()
  const c = idSchema.safeParse(clientId)
  const p = idSchema.safeParse(projectId)
  if (!c.success || !p.success) return { success: false, error: 'Neplatná data.' }
  await sql`SELECT portal.unlink_project(${p.data})`
  revalidatePath(`${PATH}/${c.data}`)
  return { success: true }
}

/** Vytvoří pozvánku. Odkaz s kódem se vrací jen tady, podruhé už ho nikdo nezjistí. */
export async function createInvite(
  clientId: string,
  email: string | null,
  role: 'owner' | 'member',
): Promise<Result<{ url: string; expiresAt: string }>> {
  await requireAuth()
  const c = idSchema.safeParse(clientId)
  if (!c.success) return { success: false, error: 'Neplatný klient.' }
  let boundEmail: string | null = null
  if (email && email.trim()) {
    const e = emailSchema.safeParse(email)
    if (!e.success) return { success: false, error: e.error.issues[0].message }
    boundEmail = e.data
  }
  if (role !== 'owner' && role !== 'member') return { success: false, error: 'Neplatná role.' }

  try {
    const { code, hash } = generateInviteCode()
    const expires = inviteExpiry()
    const exists = await sql`SELECT 1 FROM portal.clients WHERE id = ${c.data} AND archived_at IS NULL`
    if (!exists.length) return { success: false, error: 'Klient nebyl nalezen.' }
    await sql`
      INSERT INTO portal.invites (client_id, code_hash, email, role, created_by, expires_at)
      VALUES (${c.data}, ${hash}, ${boundEmail}, ${role}, ${await adminEmail()}, ${expires.toISOString()})
    `
    revalidatePath(`${PATH}/${c.data}`)
    return { success: true, url: `${appUrl()}/klient/pozvanka/${code}`, expiresAt: expires.toISOString() }
  } catch (err) {
    if (err instanceof InviteConfigError) {
      return { success: false, error: 'Chybí nastavení PORTAL_INVITE_PEPPER. Doplňte ho do prostředí a zkuste to znovu.' }
    }
    console.error('[portal] pozvánka selhala:', err instanceof Error ? err.name : 'unknown')
    return { success: false, error: 'Pozvánku se nepodařilo vytvořit.' }
  }
}

export async function revokeInvite(clientId: string, inviteId: string): Promise<Result> {
  await requireAuth()
  const c = idSchema.safeParse(clientId)
  const i = idSchema.safeParse(inviteId)
  if (!c.success || !i.success) return { success: false, error: 'Neplatná data.' }
  await sql`UPDATE portal.invites SET revoked_at = now() WHERE id = ${i.data} AND client_id = ${c.data} AND used_at IS NULL`
  revalidatePath(`${PATH}/${c.data}`)
  return { success: true }
}

export async function removeMember(clientId: string, memberId: string): Promise<Result> {
  await requireAuth()
  const c = idSchema.safeParse(clientId)
  const m = idSchema.safeParse(memberId)
  if (!c.success || !m.success) return { success: false, error: 'Neplatná data.' }
  await sql`UPDATE portal.members SET removed_at = now() WHERE id = ${m.data} AND client_id = ${c.data}`
  revalidatePath(`${PATH}/${c.data}`)
  return { success: true }
}

/** Odpověď klientovi do jeho prostoru (zpráva ve vlákně u zakázky). */
export async function replyToClient(projectId: string, body: string): Promise<Result> {
  await requireAuth()
  const p = idSchema.safeParse(projectId)
  const text = z.string().trim().min(1, 'Napište prosím zprávu.').max(2000, 'Zpráva může mít nejvýše 2000 znaků.').safeParse(body)
  if (!p.success) return { success: false, error: 'Neplatná zakázka.' }
  if (!text.success) return { success: false, error: text.error.issues[0].message }
  const linked = await sql`SELECT client_id FROM portal.projects WHERE id = ${p.data}`
  const clientId = (linked[0] as { client_id: string } | undefined)?.client_id
  if (!clientId) return { success: false, error: 'Zakázka není propojená s klientským prostorem.' }
  await sql`
    INSERT INTO portal.messages (client_id, project_id, author, body)
    VALUES (${clientId}, ${p.data}, 'admin', ${text.data})
  `
  revalidatePath(`/klient/projekt/${p.data}`)
  return { success: true }
}
