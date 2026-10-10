'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { assertWritable } from '@/lib/ws/billing'
import { hasRole, requireBusiness, requireWorkspace } from '@/lib/ws/context'
import { fail, ok, type Result } from '@/lib/ws/result'
import { recomputeSegments, saveSegmentRules } from '@/lib/ws/segments'

// Nastavení › Skupiny zákazníků (S12). Jen vlastník. Po uložení se skupiny
// celého byznysu hned přepočítají podle nových hranic.

const days = z.number().int().min(1).max(3650)

const schema = z.object({
  slug: z.string().min(1).max(60).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  newDays: days,
  regularMinVisits: z.number().int().min(1).max(100),
  regularWindowDays: z.number().int().min(30).max(3650),
  dormantFactor: z.number().min(1).max(10).multipleOf(0.25),
  dormantMinDays: days,
})

export async function saveSegmentSettings(raw: unknown): Promise<Result<{ changed: number }>> {
  const ctx = await requireWorkspace()
  const parsed = schema.safeParse(raw)
  if (!parsed.success) return fail('Něco v nastavení nesedí. Zkontrolujte prosím čísla.')
  const { slug, ...rules } = parsed.data
  const business = await requireBusiness(ctx, slug)
  if (!hasRole(ctx, 'owner')) return fail('Skupiny zákazníků nastavuje majitel účtu.')
  const blocked = await assertWritable(ctx)
  if (blocked) return blocked

  try {
    await saveSegmentRules(ctx, business, rules)
    const res = await recomputeSegments(ctx, business)
    revalidatePath(`/w/${business.slug}`, 'layout')
    return ok({ changed: res.changed })
  } catch (e) {
    console.error('saveSegmentSettings', { accountId: ctx.accountId, error: e instanceof Error ? e.message : 'unknown' })
    return fail('Nepodařilo se uložit. Zkuste to prosím znovu.')
  }
}
