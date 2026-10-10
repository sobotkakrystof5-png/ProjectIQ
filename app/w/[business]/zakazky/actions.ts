'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { assertWritable } from '@/lib/ws/billing'
import { requireBusiness, requireWorkspace } from '@/lib/ws/context'
import { deliver, notifyJobUpdate } from '@/lib/ws/email/notify'
import { addJobUpdate, setJobResultUrl, setJobUpdateDeleted } from '@/lib/ws/jobs'
import { fail, ok, type Result } from '@/lib/ws/result'

// Zprávy pro zákazníka a výsledek zakázky (S16). requireWorkspace → Zod →
// byznys z URL ověřený proti účtu → assertWritable. Zákazník je uvidí
// v klientském portálu; e-mail o nové zprávě jde jen na přání a jeho
// chyba zprávu nezruší.

const slug = z.string().min(1).max(60).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
const uuid = z.string().uuid()
const FAILED = 'Nepodařilo se uložit. Zkuste to prosím znovu.'
const GONE = 'Zakázka tu už není. Obnovte prosím stránku.'

async function prepare(rawSlug: string) {
  const ctx = await requireWorkspace()
  const business = await requireBusiness(ctx, rawSlug)
  const blocked = await assertWritable(ctx)
  return { ctx, business, blocked }
}

const done = (businessSlug: string) => revalidatePath(`/w/${businessSlug}`, 'layout')

const log = (name: string, accountId: string, e: unknown) =>
  console.error(`ws.jobs.${name}`, { accountId, error: e instanceof Error ? e.message : 'unknown' })

export async function postJobUpdate(raw: unknown): Promise<Result<{ id: string; emailed: boolean }>> {
  const parsed = z
    .object({
      slug,
      jobId: uuid,
      body: z.string().trim().min(1, 'Napište prosím zprávu.').max(2000, 'Zpráva je moc dlouhá (nejvýš 2 000 znaků).'),
      email: z.boolean(),
    })
    .safeParse(raw)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Napište prosím zprávu.')
  const { ctx, business, blocked } = await prepare(parsed.data.slug)
  if (blocked) return blocked
  try {
    const id = await addJobUpdate(ctx, business, parsed.data.jobId, parsed.data.body)
    if (!id) return fail(GONE)
    let emailed = false
    if (parsed.data.email) {
      emailed = await notifyJobUpdate(ctx, business.id, parsed.data.jobId, id, parsed.data.body)
      if (emailed) await deliver(ctx)
    }
    done(business.slug)
    return ok({ id, emailed })
  } catch (e) {
    log('postUpdate', ctx.accountId, e)
    return fail(FAILED)
  }
}

export async function toggleJobUpdate(raw: unknown): Promise<Result<null>> {
  const parsed = z.object({ slug, updateId: uuid, deleted: z.boolean() }).safeParse(raw)
  if (!parsed.success) return fail(FAILED)
  const { ctx, business, blocked } = await prepare(parsed.data.slug)
  if (blocked) return blocked
  try {
    if (!(await setJobUpdateDeleted(ctx, business, parsed.data.updateId, parsed.data.deleted))) return fail('Zpráva tu už není.')
    done(business.slug)
    return ok(null)
  } catch (e) {
    log('toggleUpdate', ctx.accountId, e)
    return fail(FAILED)
  }
}

export async function saveJobResult(raw: unknown): Promise<Result<null>> {
  const parsed = z
    .object({
      slug,
      jobId: uuid,
      url: z
        .string()
        .trim()
        .max(500, 'Odkaz je moc dlouhý.')
        .refine((v) => v === '' || /^https:\/\/[^\s]+$/.test(v), 'Odkaz musí začínat https://'),
    })
    .safeParse(raw)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Zkontrolujte prosím odkaz.')
  const { ctx, business, blocked } = await prepare(parsed.data.slug)
  if (blocked) return blocked
  try {
    if (!(await setJobResultUrl(ctx, business, parsed.data.jobId, parsed.data.url || null))) return fail(GONE)
    done(business.slug)
    return ok(null)
  } catch (e) {
    log('saveResult', ctx.accountId, e)
    return fail(FAILED)
  }
}
