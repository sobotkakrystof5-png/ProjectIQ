'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createCheckoutSession, createPortalSession, syncSubscription } from '@/lib/ws/billing'
import { hasRole, requireWorkspace } from '@/lib/ws/context'
import { wsDb } from '@/lib/ws/db'
import {
  closeAccount,
  getAccountCloseScheduled,
  getAccountClosing,
  liveSubscriptionIds,
  reopenAccount,
  scheduleCloseAccount,
  unscheduleCloseAccount,
} from '@/lib/ws/gdpr'
import { fail, ok, type Result } from '@/lib/ws/result'
import { getStripe } from '@/lib/ws/stripe'

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

// --- Zrušení účtu (S18, R-054) ------------------------------------------------

const ACCOUNT_OWNER_ONLY = 'Účet může zrušit jen jeho majitel.'

/**
 * Zrušení účtu ke konci zaplaceného období (R-074): předplatné ve Stripe doběhne
 * (nic dalšího se nezaplatí) a účet se zavře, až skončí. Nezaplacené předplatné
 * končí hned. Bez živého předplatného se účet zavře rovnou a běží 30denní lhůta.
 * Potvrzuje se názvem účtu, ten porovná server.
 */
export async function closeAccountAction(
  raw: unknown,
): Promise<Result<{ scheduled: true; closesAt: string | null } | { scheduled: false; deleteAfter: string }>> {
  const ctx = await requireWorkspace()
  if (!hasRole(ctx, 'owner')) return fail(ACCOUNT_OWNER_ONLY)
  const input = z.object({ confirm: z.string().trim().max(200) }).safeParse(raw)
  if (!input.success) return fail('Napište prosím název účtu.')

  try {
    const [acc] = await wsDb(ctx)<{ name: string }>`SELECT name FROM ws.accounts WHERE id = ${ctx.accountId}`
    if (!acc || acc.name.trim().toLocaleLowerCase('cs') !== input.data.confirm.toLocaleLowerCase('cs')) {
      return fail(`Název nesedí. Napište přesně: ${acc?.name ?? 'název účtu'}`)
    }
    const existing = await getAccountClosing(ctx)
    if (existing) return ok({ scheduled: false, deleteAfter: existing.deleteAfter.toISOString() })

    // Nejdřív Stripe: když selže, účet zůstane, jak byl, a jde to zkusit znovu.
    let runsUntilPeriodEnd = false
    for (const id of await liveSubscriptionIds(ctx)) {
      const sub = await getStripe().subscriptions.retrieve(id)
      if (sub.status === 'active' || sub.status === 'trialing') {
        if (!sub.cancel_at_period_end) await getStripe().subscriptions.update(id, { cancel_at_period_end: true })
        runsUntilPeriodEnd = true
      } else if (sub.status !== 'canceled' && sub.status !== 'incomplete_expired') {
        await getStripe().subscriptions.cancel(id)
      }
      await syncSubscription(id)
    }

    if (runsUntilPeriodEnd) {
      if (!(await scheduleCloseAccount(ctx))) return fail('Účet se nepodařilo zrušit. Zkuste to prosím znovu.')
      const scheduled = await getAccountCloseScheduled(ctx)
      revalidatePath('/w', 'layout')
      return ok({ scheduled: true, closesAt: scheduled?.closesAt?.toISOString() ?? null })
    }

    const until = await closeAccount(ctx)
    if (!until) return fail('Účet se nepodařilo zrušit. Zkuste to prosím znovu.')
    revalidatePath('/w', 'layout')
    return ok({ scheduled: false, deleteAfter: until.toISOString() })
  } catch (e) {
    console.error('[ws/ucet] zrušení účtu selhalo', { accountId: ctx.accountId, error: (e as Error).message })
    return fail('Účet se nepodařilo zrušit. Zkuste to prosím za chvíli.')
  }
}

/** Rozmyšlení před koncem období: předplatné ve Stripe zase pokračuje. */
export async function keepAccountAction(): Promise<Result<null>> {
  const ctx = await requireWorkspace()
  if (!hasRole(ctx, 'owner')) return fail(ACCOUNT_OWNER_ONLY)
  try {
    if (!(await getAccountCloseScheduled(ctx))) return ok(null)
    for (const id of await liveSubscriptionIds(ctx)) {
      const sub = await getStripe().subscriptions.retrieve(id)
      if ((sub.status === 'active' || sub.status === 'trialing') && sub.cancel_at_period_end) {
        await getStripe().subscriptions.update(id, { cancel_at_period_end: false })
      }
      await syncSubscription(id)
    }
    await unscheduleCloseAccount(ctx)
    revalidatePath('/w', 'layout')
    return ok(null)
  } catch (e) {
    console.error('[ws/ucet] zrušení zrušení účtu selhalo', { accountId: ctx.accountId, error: (e as Error).message })
    return fail('Nepodařilo se to. Zkuste to prosím za chvíli.')
  }
}

/** Obnovení ve 30denní lhůtě. Předplatné se pak založí znovu (Obnovit předplatné). */
export async function reopenAccountAction(): Promise<Result<null>> {
  const ctx = await requireWorkspace()
  if (!hasRole(ctx, 'owner')) return fail(ACCOUNT_OWNER_ONLY)
  try {
    if (!(await reopenAccount(ctx))) return fail('Účet už obnovit nejde.')
    revalidatePath('/w', 'layout')
    return ok(null)
  } catch (e) {
    console.error('[ws/ucet] obnovení účtu selhalo', { accountId: ctx.accountId, error: (e as Error).message })
    return fail('Účet se nepodařilo obnovit. Zkuste to prosím znovu.')
  }
}
