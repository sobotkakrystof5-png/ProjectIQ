'use server'

import { z } from 'zod'
import { getAuthUser } from '@/lib/supabase/server'
import { accountIdForUser, createAccountWithBusiness } from '@/lib/ws/onboarding'
import { fail, ok, type Result } from '@/lib/ws/result'
import { isIndustryKey, type IndustryKey } from '@/lib/ws/templates'

// Průvodce Nový byznys, krok 1 (S07). requireWorkspace() tu nejde — účet teprve
// vzniká. Přihlášení ověří Supabase Auth (R-080), account_id vygeneruje server,
// z formuláře přichází jen název a obor.

const input = z.object({
  name: z.string().trim().min(2).max(80),
  industry: z
    .string()
    .max(40)
    .refine((v): v is IndustryKey => isIndustryKey(v)),
})

export async function createBusiness(raw: unknown): Promise<Result<{ accountId: string }>> {
  const user = await getAuthUser()
  if (!user) return fail('Přihlášení vypršelo. Přihlaste se prosím znovu.')

  const parsed = input.safeParse(raw)
  if (!parsed.success) return fail('Doplňte prosím název byznysu a vyberte obor.')
  const { name, industry } = parsed.data

  try {
    // Účet už má (druhá záložka, pozvánka z adminu) — nový nezakládat (R-026).
    const existing = await accountIdForUser(user.id)
    if (existing) return ok({ accountId: existing })

    const { accountId } = await createAccountWithBusiness({
      name,
      industry: industry as IndustryKey,
      owner: { userId: user.id, name: user.name, email: user.email },
    })
    console.info('[ws/novy] účet založen', { accountId, industry })
    return ok({ accountId })
  } catch (e) {
    console.error('[ws/novy] založení selhalo', { error: (e as Error).message })
    return fail('Byznys se nepodařilo založit. Zkuste to prosím znovu.')
  }
}
