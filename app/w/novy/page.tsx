import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { industrySummaries } from '@/components/ws/onboarding/industry-summaries'
import { NewBusinessWizard } from '@/components/ws/onboarding/new-business-wizard'
import { SubscribeStep } from '@/components/ws/onboarding/subscribe-step'
import { getBillingState, TRIAL_DAYS } from '@/lib/ws/billing'
import { currentIdentity, hasRole, requireWorkspace } from '@/lib/ws/context'
import { wsDb } from '@/lib/ws/db'
import { getAccountClosing } from '@/lib/ws/gdpr'
import { accountIdForUser } from '@/lib/ws/onboarding'
import { WS_HOME_PATH, WS_ONBOARDING_PATH, WS_SIGN_IN_PATH } from '@/lib/ws/paths'

export const metadata: Metadata = { title: 'Nový byznys' }

// Průvodce Nový byznys (S07, S08). Kam koho poslat:
//   účet má, předplatné založené → rovnou do /w
//   účet má, předplatné nikdy    → krok 2 (předplatné, R-038)
//   účet nemá                    → krok 1
// Účet a roli určuje ws.members (R-080); klient pozvaný z adminu se do účtu
// zapíše už při uplatnění pozvánky (/w/pozvanka).

export default async function NovyPage() {
  const identity = await currentIdentity()
  if (!identity) redirect(`${WS_SIGN_IN_PATH}?next=${encodeURIComponent(WS_ONBOARDING_PATH)}`)

  if (await accountIdForUser(identity.userId)) {
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

  return <NewBusinessWizard industries={industrySummaries()} />
}
