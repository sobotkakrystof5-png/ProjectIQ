'use server'

import { z } from 'zod'
import { getWsIdentity } from '@/lib/ws/context'
import { createAccountWithBusiness } from '@/lib/ws/onboarding'
import { WS_SIGNUP_OPEN } from '@/lib/ws/paths'
import { fail, ok, type Result } from '@/lib/ws/result'
import { isIndustryKey, type IndustryKey } from '@/lib/ws/templates'

// Průvodce Nový byznys, krok 1 (S07, od R-154 bez Clerku). requireWorkspace()
// tu nejde — účet teprve vzniká. Přihlášení ověří Supabase, account_id
// vygeneruje server, z formuláře přichází jen název a obor. Dokud není
// registrace otevřená (R-134), zakládá účty jen admin pozváním.

const input = z.object({
  name: z.string().trim().min(2).max(80),
  industry: z
    .string()
    .max(40)
    .refine((v): v is IndustryKey => isIndustryKey(v)),
})

export async function createBusiness(raw: unknown): Promise<Result<null>> {
  const identity = await getWsIdentity()
  if (!identity) return fail('Přihlášení vypršelo. Přihlaste se prosím znovu.')
  if (!WS_SIGNUP_OPEN) return fail('ZakazIQ zatím spouštíme postupně. Napište nám a účet vám připravíme.')

  const parsed = input.safeParse(raw)
  if (!parsed.success) return fail('Doplňte prosím název byznysu a vyberte obor.')
  const { name, industry } = parsed.data

  try {
    const { accountId, created } = await createAccountWithBusiness({
      name,
      industry: industry as IndustryKey,
      owner: { userId: identity.userId, name: identity.name ?? null, email: identity.email },
    })
    if (created) console.info('[ws/novy] účet založen', { accountId, industry })
    return ok(null)
  } catch (e) {
    console.error('[ws/novy] založení selhalo', { error: (e as Error).message })
    return fail('Byznys se nepodařilo založit. Zkuste to prosím znovu.')
  }
}
