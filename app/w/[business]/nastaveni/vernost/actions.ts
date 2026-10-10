'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { assertWritable } from '@/lib/ws/billing'
import { hasRole, requireBusiness, requireWorkspace } from '@/lib/ws/context'
import { saveLoyaltyProgram } from '@/lib/ws/loyalty'
import { fail, ok, type Result } from '@/lib/ws/result'

// Nastavení › Věrnost (S12). Jen vlastník. Služby z formuláře se v DB
// omezí na služby byznysu (saveLoyaltyProgram).

const money = z.number().min(0).max(1_000_000).refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6).nullable()

const schema = z
  .object({
    slug: z.string().min(1).max(60).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
    enabled: z.boolean(),
    stampsNeeded: z.number().int().min(1).max(50),
    rewardText: z.string().trim().max(120),
    counts: z.enum(['visit_paid', 'job_done', 'amount']),
    amountPerStamp: money,
    serviceIds: z.array(z.string().uuid()).max(200),
    minSpend: money,
    maxOnePerDay: z.boolean(),
    validityMonths: z.number().int().min(1).max(120).nullable(),
    autoStamp: z.boolean(),
  })

export async function saveLoyaltySettings(raw: unknown): Promise<Result<null>> {
  const ctx = await requireWorkspace()
  const parsed = schema.safeParse(raw)
  if (!parsed.success) return fail('Něco v nastavení nesedí. Zkontrolujte prosím čísla.')
  const input = parsed.data
  const business = await requireBusiness(ctx, input.slug)
  if (!hasRole(ctx, 'owner')) return fail('Nastavení věrnosti mění majitel účtu.')
  const blocked = await assertWritable(ctx)
  if (blocked) return blocked
  if (input.enabled && !input.rewardText) return fail('Napište prosím, co zákazník za plnou kartu dostane.')
  if (input.counts === 'amount' && !input.amountPerStamp) return fail('Napište prosím, za kolik korun je jedno razítko.')

  try {
    await saveLoyaltyProgram(ctx, business, {
      enabled: input.enabled,
      stampsNeeded: input.stampsNeeded,
      rewardText: input.rewardText,
      counts: input.counts,
      amountPerStamp: input.counts === 'amount' ? input.amountPerStamp : null,
      serviceIds: input.serviceIds,
      minSpend: input.minSpend && input.minSpend > 0 ? input.minSpend : null,
      maxOnePerDay: input.maxOnePerDay,
      validityMonths: input.validityMonths,
      autoStamp: input.autoStamp,
    })
    revalidatePath(`/w/${business.slug}`, 'layout')
    return ok(null)
  } catch (e) {
    console.error('saveLoyaltySettings', { accountId: ctx.accountId, error: e instanceof Error ? e.message : 'unknown' })
    return fail('Nepodařilo se uložit. Zkuste to prosím znovu.')
  }
}
