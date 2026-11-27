import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AuthShell } from '@/components/ws/auth/auth-shell'
import { WsSignUpClosed } from '@/components/ws/auth/auth-forms'
import { industrySummaries } from '@/components/ws/onboarding/industry-summaries'
import { NewBusinessWizard } from '@/components/ws/onboarding/new-business-wizard'
import { SubscribeStep } from '@/components/ws/onboarding/subscribe-step'
import { getBillingState, TRIAL_DAYS } from '@/lib/ws/billing'
import { accountForUser, getWsIdentity, hasRole, requireWorkspace } from '@/lib/ws/context'
import { wsDb } from '@/lib/ws/db'
import { getAccountClosing } from '@/lib/ws/gdpr'
import { WS_HOME_PATH, WS_SIGN_IN_PATH, WS_SIGNUP_OPEN } from '@/lib/ws/paths'

export const metadata: Metadata = { title: 'Nový byznys' }

// Průvodce Nový byznys (S07, S08; od R-154 bez Clerku). Kam koho poslat:
//   člen účtu, předplatné založené → rovnou do /w
//   člen účtu, předplatné nikdy    → krok 2 (předplatné, R-038) — i klient pozvaný z adminu
//   bez účtu, registrace otevřená  → krok 1
//   bez účtu, registrace zavřená   → vysvětlení, že účet připravíme osobně (R-134)

export default async function NovyPage() {
  const identity = await getWsIdentity()
  if (!identity) redirect(WS_SIGN_IN_PATH)

  if (await accountForUser(identity.userId)) {
    const ctx = await requireWorkspace()
    if (await getAccountClosing(ctx)) redirect('/w/ucet')
    const billing = await getBillingState(ctx.accountId)
    if (billing.access !== 'none') redirect(WS_HOME_PATH)

    const [business] = await wsDb(ctx)<{ name: string }>`
      SELECT name FROM ws.businesses
      WHERE account_id = ${ctx.accountId} AND archived_at IS NULL
      ORDER BY created_at LIMIT 1
    `
    return (
      <SubscribeStep
        businessName={business?.name ?? null}
        firstPaymentOn={new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000)}
        isOwner={hasRole(ctx, 'owner')}
      />
    )
  }

  if (!WS_SIGNUP_OPEN) {
    return (
      <AuthShell>
        <WsSignUpClosed />
      </AuthShell>
    )
  }
  return <NewBusinessWizard industries={industrySummaries()} />
}
