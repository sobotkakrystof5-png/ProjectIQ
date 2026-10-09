'use server'

import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { orgForNewAccount, ownerProfile } from '@/lib/ws/clerk-orgs'
import { createAccountWithBusiness } from '@/lib/ws/onboarding'
import { fail, ok, type Result } from '@/lib/ws/result'
import { isIndustryKey, type IndustryKey } from '@/lib/ws/templates'

// Průvodce Nový byznys, krok 1 (S07). requireWorkspace() tu nejde — účet teprve
// vzniká. Přihlášení ověří auth(), account_id vygeneruje server, z formuláře
// přichází jen název a obor.

const input = z.object({
  name: z.string().trim().min(2).max(80),
  industry: z
    .string()
    .max(40)
    .refine((v): v is IndustryKey => isIndustryKey(v)),
})

export async function createBusiness(raw: unknown): Promise<Result<{ orgId: string }>> {
  const { userId } = await auth()
  if (!userId) return fail('Přihlášení vypršelo. Přihlaste se prosím znovu.')

  const parsed = input.safeParse(raw)
  if (!parsed.success) return fail('Doplňte prosím název byznysu a vyberte obor.')
  const { name, industry } = parsed.data

  try {
    const { orgId, hasAccount } = await orgForNewAccount(userId, name)
    if (hasAccount) return ok({ orgId })

    const owner = await ownerProfile(userId)
    const { accountId } = await createAccountWithBusiness({
      orgId,
      name,
      industry: industry as IndustryKey,
      owner: { userId, ...owner },
    })
    console.info('[ws/novy] účet založen', { accountId, industry })
    return ok({ orgId })
  } catch (e) {
    console.error('[ws/novy] založení selhalo', { error: (e as Error).message })
    return fail('Byznys se nepodařilo založit. Zkuste to prosím znovu.')
  }
}
