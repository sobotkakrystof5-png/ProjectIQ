'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getAdmin } from '@/lib/ws/admin/auth'
import {
  deleteNewsDraft,
  NewsInputError,
  newsRecipients,
  publishNews,
  saveNews,
  sendNewsEmail,
  unpublishNews,
  type NewsRecipients,
} from '@/lib/ws/admin/news'
import { NEWS_LIMITS, NEWS_TAGS } from '@/lib/ws/news-format'
import { fail, ok, type Result } from '@/lib/ws/result'

// Akce /dashboard/novinky (S17). Jen admin s NextAuth session.

const NO_ADMIN = 'Přihlášení vypršelo. Přihlas se prosím znovu.'
const FAILED = 'Nepodařilo se uložit. Zkus to prosím znovu.'
const id = z.string().uuid()

const saveSchema = z.object({
  id: id.nullable(),
  title: z.string().max(NEWS_LIMITS.title + 50),
  body: z.string().max(NEWS_LIMITS.body + 200),
  link: z.string().max(NEWS_LIMITS.link + 50),
  tag: z.enum(NEWS_TAGS),
  image: z.discriminatedUnion('action', [
    z.object({ action: z.literal('keep') }),
    z.object({ action: z.literal('remove') }),
    // 600 kB jako base64 ≈ 820 kB textu
    z.object({ action: z.literal('set'), base64: z.string().max(900_000) }),
  ]),
})

const refresh = () => {
  revalidatePath('/dashboard/novinky')
}

export async function saveNewsAction(raw: unknown): Promise<Result<{ id: string }>> {
  const admin = await getAdmin()
  if (!admin) return fail(NO_ADMIN)
  const parsed = saveSchema.safeParse(raw)
  if (!parsed.success) return fail('Něco ve formuláři nesedí. Zkontroluj délku textu a obrázek.')
  try {
    const { id: newsId, ...input } = parsed.data
    const saved = await saveNews(admin, newsId, input)
    refresh()
    return ok({ id: saved })
  } catch (e) {
    if (e instanceof NewsInputError) return fail(e.message)
    console.error('admin.saveNews', { error: e instanceof Error ? e.message : 'unknown' })
    return fail(FAILED)
  }
}

async function simple(raw: unknown, fn: (id: string) => Promise<boolean>, notDone: string): Promise<Result<null>> {
  const admin = await getAdmin()
  if (!admin) return fail(NO_ADMIN)
  const parsed = z.object({ id }).safeParse(raw)
  if (!parsed.success) return fail('Obnov prosím stránku.')
  try {
    if (!(await fn(parsed.data.id))) return fail(notDone)
    refresh()
    return ok(null)
  } catch (e) {
    console.error('admin.news', { error: e instanceof Error ? e.message : 'unknown' })
    return fail(FAILED)
  }
}

export async function publishNewsAction(raw: unknown) {
  return simple(raw, publishNews, 'Tahle novinka už neexistuje.')
}

export async function unpublishNewsAction(raw: unknown) {
  return simple(raw, unpublishNews, 'Novinka už odešla e-mailem, z aplikace ji skrýt nejde.')
}

export async function deleteNewsAction(raw: unknown) {
  return simple(raw, deleteNewsDraft, 'Smazat jde jen koncept. Zveřejněnou novinku nejdřív skryj.')
}

/** Kolik lidí novinku dostane — ukáže se v potvrzení před odesláním. */
export async function newsRecipientsAction(): Promise<Result<NewsRecipients>> {
  const admin = await getAdmin()
  if (!admin) return fail(NO_ADMIN)
  try {
    return ok(await newsRecipients())
  } catch (e) {
    console.error('admin.newsRecipients', { error: e instanceof Error ? e.message : 'unknown' })
    return fail('Počet příjemců se nepodařilo zjistit.')
  }
}

export async function sendNewsEmailAction(raw: unknown): Promise<Result<{ recipients: number; delivered: number; waiting: boolean }>> {
  const admin = await getAdmin()
  if (!admin) return fail(NO_ADMIN)
  const parsed = z.object({ id, confirmedPeople: z.number().int().min(0).max(1_000_000) }).safeParse(raw)
  if (!parsed.success) return fail('Obnov prosím stránku.')
  try {
    const r = await sendNewsEmail(admin, parsed.data.id, parsed.data.confirmedPeople)
    refresh()
    if (r.status === 'not_published') return fail('Nejdřív novinku zveřejni v aplikaci.')
    if (r.status === 'already_sent') return fail('Tahle novinka už e-mailem odešla.')
    if (r.status === 'recipients_changed') return fail(`Počet příjemců se mezitím změnil na ${r.recipients.people}. Potvrď to prosím znovu.`)
    return ok({ recipients: r.recipients, delivered: r.delivered, waiting: !process.env.WS_EMAIL_FROM })
  } catch (e) {
    console.error('admin.sendNewsEmail', { error: e instanceof Error ? e.message : 'unknown' })
    return fail('E-maily se nepodařilo zařadit. Zkus to prosím znovu.')
  }
}
