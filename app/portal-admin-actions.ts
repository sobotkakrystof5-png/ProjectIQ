'use server'

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { z } from 'zod'
import { adminActorEmail, requireAuth } from '@/lib/auth'
import { sql } from '@/lib/db'
import { vizeonMailConfigured } from '@/lib/admin/vizeon-mail'
import { generateInviteCode, inviteExpiry, InviteConfigError } from '@/lib/portal/invite'
import { PORTAL_INVITE_DELAY_MS } from '@/lib/portal/invite-delay'
import { deliverPortalInvite, type PortalInviteDelivery } from '@/lib/portal/project-access'
import { isAdminEmail } from '@/lib/supabase/config'

// Správa klientských prostorů z adminu (KP05). Běží vlastníkem tabulek (lib/db),
// ne rolí portal_app. Každá akce začíná requireAuth().

type Result<T = object> = ({ success: true } & T) | { success: false; error: string }

const idSchema = z.string().uuid()
const nameSchema = z.string().trim().min(1, 'Napište prosím název firmy.').max(200, 'Název může mít nejvýše 200 znaků.')
const emailSchema = z.string().trim().toLowerCase().email('Zadejte platný e-mail.').max(320)

const PATH = '/dashboard/klientsky-prostor'

async function adminEmail(): Promise<string> {
  return adminActorEmail()
}

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || '').replace(/\/+$/, '')
}

/** Pozvánka vázaná na e-mail. Kód se vrací jen tady, v databázi je jen jeho HMAC. */
async function insertInvite(
  clientId: string,
  email: string,
  role: 'owner' | 'member',
): Promise<{ id: string; url: string; expiresAt: Date }> {
  const { code, hash } = generateInviteCode()
  const expires = inviteExpiry()
  const rows = await sql`
    INSERT INTO portal.invites (client_id, code_hash, email, role, created_by, expires_at)
    VALUES (${clientId}, ${hash}, ${email}, ${role}, ${await adminEmail()}, ${expires.toISOString()})
    RETURNING id
  `
  return { id: String((rows[0] as { id: string }).id), url: `${appUrl()}/klient/pozvanka/${code}`, expiresAt: expires }
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

/**
 * Vytvoří pozvánku. Odkaz s kódem se vrací jen tady, podruhé už ho nikdo nezjistí.
 * Pozvánka je vždy vázaná na e-mail (R-107, migrace 113): s tímhle e-mailem se
 * klient registruje a nikdo jiný ji neuplatní, ani když dostane odkaz přeposlaný.
 */
export async function createInvite(
  clientId: string,
  email: string,
  role: 'owner' | 'member',
): Promise<Result<{ url: string; expiresAt: string }>> {
  await requireAuth()
  const c = idSchema.safeParse(clientId)
  if (!c.success) return { success: false, error: 'Neplatný klient.' }
  const e = emailSchema.safeParse(email ?? '')
  if (!e.success) return { success: false, error: 'Zadejte e-mail, na který pozvánka půjde.' }
  // Klient nesmí dostat účet se stejným e-mailem jako admin (sdílený projekt Supabase).
  if (isAdminEmail(e.data)) return { success: false, error: 'Tenhle e-mail patří administraci. Zadejte e-mail klienta.' }
  const boundEmail = e.data
  if (role !== 'owner' && role !== 'member') return { success: false, error: 'Neplatná role.' }

  try {
    const exists = await sql`SELECT 1 FROM portal.clients WHERE id = ${c.data} AND archived_at IS NULL`
    if (!exists.length) return { success: false, error: 'Klient nebyl nalezen.' }
    const invite = await insertInvite(c.data, boundEmail, role)
    revalidatePath(`${PATH}/${c.data}`)
    return { success: true, url: invite.url, expiresAt: invite.expiresAt.toISOString() }
  } catch (err) {
    if (err instanceof InviteConfigError) {
      return { success: false, error: 'Chybí nastavení PORTAL_INVITE_PEPPER. Doplňte ho do prostředí a zkuste to znovu.' }
    }
    console.error('[portal] pozvánka selhala:', err instanceof Error ? err.name : 'unknown')
    return { success: false, error: 'Pozvánku se nepodařilo vytvořit.' }
  }
}

export type ClientSpaceInviteResult =
  | Exclude<ClientSpaceInviteOk, { success: false }>
  | {
      success: false
      error: string
      /** E-mail už patří do prostoru této firmy: připojit zakázku tam smí jen výslovné potvrzení. */
      confirmClient?: { id: string; name: string }
    }

type ClientSpaceInviteOk = Result<{
  mode: 'invite' | 'new_project'
  email: string
  inviteId: string | null
  /** Odkaz pro ruční poslání; u pozvánky obsahuje kód a víc už ho nikdo nezjistí. */
  url: string
  /** `false` = e-mail neodejde (chybí klíč Resendu), odkaz je potřeba poslat ručně. */
  emailScheduled: boolean
  /** Zakázku propojila až tahle akce, takže „Zpět" ji zase odpojí. */
  unlinkOnUndo: boolean
}>

/**
 * „Pozvat klienta do prostoru" z detailu zakázky (KP11, R-121). Jedním krokem:
 * najde klienta (podle propojení zakázky, člena nebo čekající pozvánky se stejným
 * e-mailem), jinak ho založí; propojí zakázku a vytvoří pozvánku vázanou na
 * e-mail. Kdo už v prostoru je, pozvánku nedostane, jen zprávu o nové zakázce.
 * E-mail odchází z krystof@vizeon.cz po 10 s, do té doby jde všechno vrátit.
 * Heslo si klient nastaví sám; nikdo jiný ho nezná (D-K12).
 */
export async function inviteToClientSpace(
  projectId: string,
  input: { company?: string; email: string; confirmClientId?: string },
): Promise<ClientSpaceInviteResult> {
  await requireAuth()
  const p = idSchema.safeParse(projectId)
  if (!p.success) return { success: false, error: 'Neplatná zakázka.' }
  const e = emailSchema.safeParse(input?.email ?? '')
  if (!e.success) return { success: false, error: 'Zadejte e-mail klienta, na který pozvánka půjde.' }
  if (isAdminEmail(e.data)) return { success: false, error: 'Tenhle e-mail patří administraci. Zadejte e-mail klienta.' }
  const email = e.data
  const base = appUrl()
  if (!/^https?:\/\//.test(base)) {
    return { success: false, error: 'Chybí adresa aplikace (NEXT_PUBLIC_APP_URL), odkaz v pozvánce by nefungoval.' }
  }

  try {
    const projectRows = await sql`
      SELECT client_name, coalesce(nullif(btrim(coalesce(description, '')), ''), client_name) AS title
      FROM projects WHERE id = ${p.data}
    `
    const project = projectRows[0] as { client_name: string; title: string } | undefined
    if (!project) return { success: false, error: 'Zakázka nebyla nalezena.' }

    const linked = await sql`SELECT client_id FROM portal.projects WHERE id = ${p.data}`
    let clientId = (linked[0] as { client_id: string } | undefined)?.client_id ?? null
    let unlinkOnUndo = false

    if (!clientId) {
      // Stejný člověk = stejný klient, ať se jedna firma nerozpadne na víc prostorů.
      const known = await sql`
        SELECT client_id FROM (
          SELECT m.client_id, m.created_at FROM portal.members m
          JOIN portal.clients c ON c.id = m.client_id AND c.archived_at IS NULL
          WHERE lower(m.email) = ${email} AND m.removed_at IS NULL
          UNION ALL
          SELECT i.client_id, i.created_at FROM portal.invites i
          JOIN portal.clients c ON c.id = i.client_id AND c.archived_at IS NULL
          WHERE lower(i.email) = ${email} AND i.used_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > now()
        ) k ORDER BY created_at DESC LIMIT 1
      `
      clientId = (known[0] as { client_id: string } | undefined)?.client_id ?? null
      // Nikdy potichu: zakázka v cizím prostoru = uvidí ji lidé z jiné firmy.
      if (clientId && input?.confirmClientId !== clientId) {
        const named = await sql`SELECT name FROM portal.clients WHERE id = ${clientId}`
        const name = String((named[0] as { name: string } | undefined)?.name ?? '')
        return {
          success: false,
          error: `Tenhle e-mail už má prostor firmy ${name}. Zakázku tam uvidí všichni lidé z toho prostoru.`,
          confirmClient: { id: clientId, name },
        }
      }
      if (!clientId) {
        const name = nameSchema.safeParse(input?.company?.trim() || project.client_name)
        if (!name.success) return { success: false, error: name.error.issues[0].message }
        const created = await sql`INSERT INTO portal.clients (name) VALUES (${name.data}) RETURNING id`
        clientId = String((created[0] as { id: string }).id)
      }
      await sql`SELECT portal.link_project(${clientId}, ${p.data})`
      unlinkOnUndo = true
    }

    const member = await sql`
      SELECT 1 FROM portal.members
      WHERE client_id = ${clientId} AND lower(email) = ${email} AND removed_at IS NULL
    `
    let delivery: PortalInviteDelivery
    if (member.length) {
      if (!unlinkOnUndo) return { success: false, error: 'Tenhle člověk už v prostoru je a zakázku vidí.' }
      delivery = {
        mode: 'new_project',
        projectId: p.data,
        clientId,
        inviteId: null,
        email,
        url: `${base}/klient/projekt/${p.data}`,
        projectTitle: project.title,
        expiresAt: null,
      }
    } else {
      // Nová pozvánka nahradí starou na stejný e-mail; platí vždy jen poslední odkaz.
      await sql`
        UPDATE portal.invites SET revoked_at = now()
        WHERE client_id = ${clientId} AND lower(email) = ${email} AND used_at IS NULL AND revoked_at IS NULL
      `
      const owners = await sql`SELECT 1 FROM portal.members WHERE client_id = ${clientId} AND removed_at IS NULL`
      const invite = await insertInvite(clientId, email, owners.length ? 'member' : 'owner')
      delivery = {
        mode: 'invite',
        projectId: p.data,
        clientId,
        inviteId: invite.id,
        email,
        url: invite.url,
        projectTitle: project.title,
        expiresAt: invite.expiresAt,
      }
    }

    const emailScheduled = vizeonMailConfigured()
    if (emailScheduled) {
      after(async () => {
        // O 3 s déle než odpočet „Zpět“ v toastu, ať kliknutí v poslední vteřině stihne dojít na server.
        await new Promise((resolve) => setTimeout(resolve, PORTAL_INVITE_DELAY_MS + 3_000))
        try {
          await deliverPortalInvite(delivery)
        } catch (err) {
          console.error('[portal] odeslání pozvánky spadlo:', err instanceof Error ? err.message : 'unknown')
        }
      })
    }

    revalidatePath(`/dashboard/${p.data}`)
    revalidatePath(`${PATH}/${clientId}`)
    return {
      success: true,
      mode: delivery.mode,
      email,
      inviteId: delivery.inviteId,
      url: delivery.url,
      emailScheduled,
      unlinkOnUndo,
    }
  } catch (err) {
    if (err instanceof InviteConfigError) {
      return { success: false, error: 'Chybí nastavení PORTAL_INVITE_PEPPER. Doplňte ho do prostředí a zkuste to znovu.' }
    }
    const code = (err as { code?: string }).code
    if (code === '23505') return { success: false, error: 'Zakázka už patří jinému klientovi.' }
    if (code === '42P01' || code === '3F000') {
      return { success: false, error: 'Klientský prostor v databázi ještě není (chybí migrace 095).' }
    }
    console.error('[portal] pozvání do prostoru selhalo:', err instanceof Error ? err.name : 'unknown')
    return { success: false, error: 'Klienta se nepodařilo pozvat. Zkuste to prosím znovu.' }
  }
}

/**
 * „Zpět" u pozvání: zruší pozvánku (e-mail pak neodejde, `deliverPortalInvite`
 * si stav přečte znovu) a odpojí zakázku, kterou propojilo až pozvání. Klienta,
 * kterého pozvání před chvílí založilo a nic dalšího nemá, smaže, ať se při
 * opakovaném „Zpět" nehromadí prázdné prostory.
 */
export async function undoClientSpaceInvite(
  projectId: string,
  inviteId: string | null,
  unlink: boolean,
): Promise<Result> {
  await requireAuth()
  const p = idSchema.safeParse(projectId)
  const i = inviteId === null ? null : idSchema.safeParse(inviteId)
  if (!p.success || (i && !i.success)) return { success: false, error: 'Neplatná data.' }

  const linked = await sql`SELECT client_id FROM portal.projects WHERE id = ${p.data}`
  const clientId = (linked[0] as { client_id: string } | undefined)?.client_id ?? null
  if (i?.success) {
    await sql`
      UPDATE portal.invites SET revoked_at = now()
      WHERE id = ${i.data} AND used_at IS NULL AND revoked_at IS NULL
    `
  }
  if (unlink && clientId) {
    await sql`SELECT portal.unlink_project(${p.data})`
    await sql`
      DELETE FROM portal.clients c
      WHERE c.id = ${clientId} AND c.created_at > now() - interval '10 minutes'
        AND NOT EXISTS (SELECT 1 FROM portal.projects x WHERE x.client_id = c.id)
        AND NOT EXISTS (SELECT 1 FROM portal.members x WHERE x.client_id = c.id)
        AND NOT EXISTS (
          SELECT 1 FROM portal.invites x WHERE x.client_id = c.id AND x.used_at IS NULL AND x.revoked_at IS NULL
        )
    `
  }
  revalidatePath(`/dashboard/${p.data}`)
  if (clientId) revalidatePath(`${PATH}/${clientId}`)
  return { success: true }
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
