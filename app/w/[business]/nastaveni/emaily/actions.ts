'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { assertWritable } from '@/lib/ws/billing'
import { hasRole, requireBusiness, requireWorkspace } from '@/lib/ws/context'
import { BODY_MAX, MESSAGE_TYPES, SUBJECT_MAX } from '@/lib/ws/email/catalog'
import { getEmailSettings, saveMessageSetting, saveNewsEmails, saveReplyTo, sendTestEmail } from '@/lib/ws/email/settings'
import { fail, ok, type Result } from '@/lib/ws/result'

// Nastavení › E-maily a upozornění (S15). Mění jen vlastník; bez předplatného
// jen čtení (zkušební e-mail jde poslat i tak — nic v účtu nemění).

const slug = z.string().min(1).max(60).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
const text = (max: number) => z.string().max(max).nullable()

async function prepare(raw: unknown, write = true) {
  const parsed = z.object({ slug }).passthrough().safeParse(raw)
  if (!parsed.success) return fail('Něco v údajích nesedí. Obnovte prosím stránku.')
  const ctx = await requireWorkspace()
  const business = await requireBusiness(ctx, parsed.data.slug)
  if (!hasRole(ctx, 'owner')) return fail('Nastavení firmy mění majitel účtu.')
  if (write) {
    const blocked = await assertWritable(ctx)
    if (blocked) return blocked
  }
  return { ok: true as const, ctx, business, input: parsed.data as Record<string, unknown> }
}

const log = (name: string, accountId: string, e: unknown) =>
  console.error(name, { accountId, error: e instanceof Error ? e.message : 'unknown' })
const revalidateEmailSettings = (businessSlug: string) => {
  revalidatePath(`/w/${businessSlug}/nastaveni/komunikace`)
  revalidatePath(`/w/${businessSlug}/nastaveni/emaily`)
}

const settingSchema = z.object({
  type: z.enum(MESSAGE_TYPES),
  enabled: z.boolean(),
  subject: text(SUBJECT_MAX),
  body: text(BODY_MAX),
})

export async function saveEmailSetting(raw: unknown): Promise<Result<null>> {
  const p = await prepare(raw)
  if (!p.ok) return p
  const input = settingSchema.safeParse(p.input)
  if (!input.success) return fail(`Předmět může mít nejvýš ${SUBJECT_MAX} znaků a text ${BODY_MAX}.`)
  try {
    await saveMessageSetting(p.ctx, p.business, input.data)
    revalidateEmailSettings(p.business.slug)
    return ok(null)
  } catch (e) {
    log('settings.email', p.ctx.accountId, e)
    return fail('Nepodařilo se uložit. Zkuste to prosím znovu.')
  }
}

export async function saveEmailReplyTo(raw: unknown): Promise<Result<null>> {
  const p = await prepare(raw)
  if (!p.ok) return p
  const input = z.object({ email: z.string().trim().toLowerCase().max(254) }).safeParse(p.input)
  if (!input.success) return fail('E-mail nevypadá správně.')
  const email = input.data.email || null
  if (email && !z.string().email().safeParse(email).success) return fail('E-mail nevypadá správně. Zkontrolujte ho prosím.')
  try {
    await saveReplyTo(p.ctx, p.business, email)
    revalidateEmailSettings(p.business.slug)
    return ok(null)
  } catch (e) {
    log('settings.replyTo', p.ctx.accountId, e)
    return fail('Nepodařilo se uložit. Zkuste to prosím znovu.')
  }
}

export async function saveNewsSetting(raw: unknown): Promise<Result<null>> {
  const p = await prepare(raw)
  if (!p.ok) return p
  const input = z.object({ enabled: z.boolean() }).safeParse(p.input)
  if (!input.success) return fail('Něco v údajích nesedí.')
  try {
    await saveNewsEmails(p.ctx, input.data.enabled)
    revalidateEmailSettings(p.business.slug)
    return ok(null)
  } catch (e) {
    log('settings.news', p.ctx.accountId, e)
    return fail('Nepodařilo se uložit. Zkuste to prosím znovu.')
  }
}

export async function sendTestEmailAction(raw: unknown): Promise<Result<{ message: string }>> {
  const p = await prepare(raw, false)
  if (!p.ok) return p
  const input = settingSchema.omit({ enabled: true }).safeParse(p.input)
  if (!input.success) return fail(`Předmět může mít nejvýš ${SUBJECT_MAX} znaků a text ${BODY_MAX}.`)
  try {
    const settings = await getEmailSettings(p.ctx, p.business)
    const to = settings.myEmail ?? settings.ownerEmail
    if (!to) return fail('U vašeho účtu chybí e-mail. Doplňte ho v profilu a zkuste to znovu.')
    if (!settings.sendingReady) return fail('Odesílání e-mailů ještě není zapnuté. Náhled vidíte vedle textu.')
    const res = await sendTestEmail(p.ctx, p.business, input.data, to)
    if (res === 'too_soon') return fail('Zkušební e-mail jste poslali před chvílí. Zkuste to prosím za minutu.')
    return ok({ message: res === 'sent' ? `Odesláno na ${to}.` : `Odešleme ho za chvíli na ${to}.` })
  } catch (e) {
    log('settings.testEmail', p.ctx.accountId, e)
    return fail('Zkušební e-mail se nepodařilo poslat. Zkuste to prosím znovu.')
  }
}
