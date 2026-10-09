import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { ActivateAccount } from '@/components/ws/onboarding/activate-account'
import { industrySummaries } from '@/components/ws/onboarding/industry-summaries'
import { NewBusinessWizard } from '@/components/ws/onboarding/new-business-wizard'
import { SubscribeStep } from '@/components/ws/onboarding/subscribe-step'
import { getBillingState, TRIAL_DAYS } from '@/lib/ws/billing'
import { orgWithAccount } from '@/lib/ws/clerk-orgs'
import { hasRole, requireWorkspace } from '@/lib/ws/context'
import { wsDb } from '@/lib/ws/db'
import { accountIdForOrg } from '@/lib/ws/onboarding'
import { WS_HOME_PATH, WS_SIGN_IN_PATH } from '@/lib/ws/paths'

export const metadata: Metadata = { title: 'Nový byznys' }

// Průvodce Nový byznys (S07, S08). Kam koho poslat:
//   účet má, organizace aktivní, předplatné založené → rovnou do /w
//   účet má, organizace aktivní, předplatné nikdy    → krok 2 (předplatné, R-038)
//   účet má, organizace neaktivní                    → aktivovat (ActivateAccount)
//   účet nemá                                        → krok 1

export default async function NovyPage() {
  const { userId, orgId } = await auth()
  if (!userId) redirect(WS_SIGN_IN_PATH)

  if (orgId && (await accountIdForOrg(orgId))) {
    const ctx = await requireWorkspace()
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

  const existing = await orgWithAccount(userId)
  if (existing) return <ActivateAccount orgId={existing} />

  return <NewBusinessWizard industries={industrySummaries()} />
}
