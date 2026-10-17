'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getAdmin } from '@/lib/ws/admin/auth'
import { getClientBusiness, getClientDetail, saveClientNote } from '@/lib/ws/admin/clients'
import { InviteSetupError, inviteClient, sendInvite } from '@/lib/ws/admin/invite'
import { generateWebKeys, WebKeysUnavailable, type WebKeysResult } from '@/lib/ws/admin/web-keys'
import { fail, ok, type Result } from '@/lib/ws/result'
import { isIndustryKey, type IndustryKey } from '@/lib/ws/templates'

// Akce /dashboard/klienti (S17). Každá začíná getAdmin() — bez NextAuth
// session nic. Účet z URL je v adminu v pořádku (admin vidí všechny), ale
// vždy se ověří, že existuje. Každá akce se zapíše do ws.audit_log účtu.

const NO_ADMIN = 'Přihlášení vypršelo. Přihlas se prosím znovu.'
const uuid = z.string().uuid()

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  businessName: z.string().trim().min(2).max(80),
  industry: z.string().max(40).refine((v): v is IndustryKey => isIndustryKey(v)),
})

export async function inviteClientAction(raw: unknown): Promise<Result<{ accountId: string; inviteSent: boolean }>> {
  const admin = await getAdmin()
  if (!admin) return fail(NO_ADMIN)
  const parsed = inviteSchema.safeParse(raw)
  if (!parsed.success) return fail('Zkontroluj e-mail, název byznysu a obor.')
  try {
    const result = await inviteClient(admin, { ...parsed.data, industry: parsed.data.industry as IndustryKey })
    revalidatePath('/dashboard/klienti')
    return ok({ accountId: result.accountId, inviteSent: result.status === 'invited' })
  } catch (e) {
    console.error('admin.inviteClient', { error: e instanceof Error ? e.message : 'unknown' })
    if (e instanceof InviteSetupError) return fail('Clerk teď organizaci nezaložil. Zkontroluj klíče Clerku a zkus to znovu.')
    return fail('Účet se nepodařilo založit. Nic nevzniklo, zkus to prosím znovu.')
  }
}

export async function resendInviteAction(raw: unknown): Promise<Result<null>> {
  const admin = await getAdmin()
  if (!admin) return fail(NO_ADMIN)
  const parsed = z.object({ accountId: uuid, email: z.string().trim().toLowerCase().email().max(254) }).safeParse(raw)
  if (!parsed.success) return fail('Zkontroluj e-mail.')
  const client = await getClientDetail(parsed.data.accountId)
  if (!client) return fail('Tenhle účet neexistuje.')
  const sent = await sendInvite(admin, client.id, client.clerkOrgId, parsed.data.email)
  revalidatePath(`/dashboard/klienti/${client.id}`)
  return sent ? ok(null) : fail('Clerk pozvánku neposlal. Možná už na ten e-mail čeká jiná — zkontroluj to v Clerku.')
}

export async function generateWebKeysAction(raw: unknown): Promise<Result<WebKeysResult>> {
  const admin = await getAdmin()
  if (!admin) return fail(NO_ADMIN)
  const parsed = z.object({ accountId: uuid, businessId: uuid }).safeParse(raw)
  if (!parsed.success) return fail('Obnov prosím stránku.')
  const business = await getClientBusiness(parsed.data.accountId, parsed.data.businessId)
  if (!business) return fail('Tenhle byznys neexistuje.')
  try {
    const keys = await generateWebKeys(admin, { accountId: parsed.data.accountId, ...business })
    revalidatePath(`/dashboard/klienti/${parsed.data.accountId}`)
    return ok(keys)
  } catch (e) {
    if (e instanceof WebKeysUnavailable) return fail('Chybí WS_KEY_PEPPER — tajný klíč teď nejde vytvořit.')
    console.error('admin.generateWebKeys', { accountId: parsed.data.accountId, error: e instanceof Error ? e.message : 'unknown' })
    return fail('Klíče se nepodařilo vytvořit. Zkus to prosím znovu.')
  }
}

export async function saveNoteAction(raw: unknown): Promise<Result<null>> {
  const admin = await getAdmin()
  if (!admin) return fail(NO_ADMIN)
  const parsed = z.object({ accountId: uuid, note: z.string().max(4000) }).safeParse(raw)
  if (!parsed.success) return fail('Poznámka může mít nejvýš 4000 znaků.')
  const client = await getClientDetail(parsed.data.accountId)
  if (!client) return fail('Tenhle účet neexistuje.')
  try {
    await saveClientNote(admin, client.id, parsed.data.note)
    revalidatePath(`/dashboard/klienti/${client.id}`)
    return ok(null)
  } catch (e) {
    console.error('admin.saveNote', { accountId: client.id, error: e instanceof Error ? e.message : 'unknown' })
    return fail('Poznámku se nepodařilo uložit.')
  }
}
