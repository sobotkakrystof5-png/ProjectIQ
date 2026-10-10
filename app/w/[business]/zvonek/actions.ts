'use server'

import { z } from 'zod'
import { requireBusiness, requireWorkspace } from '@/lib/ws/context'
import { markBellSeen } from '@/lib/ws/email/inbox'
import { fail, ok, type Result } from '@/lib/ws/result'

// Otevření zvonku (S15). Jen „přečteno“ — jde i bez předplatného (nic v datech firmy nemění).

export async function markBellSeenAction(raw: unknown): Promise<Result<null>> {
  const p = z.object({ slug: z.string().min(1).max(60).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/) }).safeParse(raw)
  if (!p.success) return fail('Obnovte prosím stránku.')
  const ctx = await requireWorkspace()
  const business = await requireBusiness(ctx, p.data.slug)
  try {
    await markBellSeen(ctx, business)
    return ok(null)
  } catch (e) {
    console.error('ws.bell.seen', { accountId: ctx.accountId, error: e instanceof Error ? e.message : 'unknown' })
    return fail('Nepodařilo se uložit.')
  }
}
