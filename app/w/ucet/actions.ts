'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createCheckoutSession, createPortalSession } from '@/lib/ws/billing'
import { hasRole, requireWorkspace } from '@/lib/ws/context'
import { fail, type Result } from '@/lib/ws/result'

// Předplatné (S08). Spravovat ho smí jen vlastník účtu. Adresy Stripe vznikají
// na serveru, z formuláře nepřichází nic — účet je vždy z requireWorkspace().

const OWNER_ONLY = 'Předplatné spravuje majitel účtu. Dejte mu prosím vědět.'

/** Customer Portal Stripe: karta, doklady, zrušení. Volá se z formuláře (redirect). */
export async function openBillingPortal(): Promise<Result<never>> {
  const ctx = await requireWorkspace()
  if (!hasRole(ctx, 'owner')) return fail(OWNER_ONLY)

  let url: string | null
  try {
    url = await createPortalSession(ctx)
  } catch (e) {
    console.error('[ws/ucet] portál Stripe selhal', { accountId: ctx.accountId, error: (e as Error).message })
    return fail('Správu předplatného se nepodařilo otevřít. Zkuste to prosím za chvíli.')
  }
  if (!url) return fail('Předplatné ještě nemáte. Založíte ho tlačítkem Obnovit předplatné.')
  redirect(url)
}

/** Stripe Checkout z /w/novy (krok 2) nebo /w/ucet (obnovení po zrušení). */
export async function startCheckout(raw: unknown): Promise<Result<never>> {
  const ctx = await requireWorkspace()
  if (!hasRole(ctx, 'owner')) return fail(OWNER_ONLY)

  const from = z.enum(['novy', 'ucet']).safeParse(raw)
  const cancelPath = from.success && from.data === 'novy' ? '/w/novy' : '/w/ucet'
  let result: Awaited<ReturnType<typeof createCheckoutSession>>
  try {
    result = await createCheckoutSession(ctx, { cancelPath })
  } catch (e) {
    console.error('[ws/ucet] Checkout selhal', { accountId: ctx.accountId, error: (e as Error).message })
    return fail('Platbu se nepodařilo otevřít. Zkuste to prosím za chvíli.')
  }
  if ('updateCard' in result) return openBillingPortal()
  redirect('url' in result ? result.url : '/w')
}
