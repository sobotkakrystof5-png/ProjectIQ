import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { ActivateAccount } from '@/components/ws/onboarding/activate-account'
import { industrySummaries } from '@/components/ws/onboarding/industry-summaries'
import { NewBusinessWizard } from '@/components/ws/onboarding/new-business-wizard'
import { orgWithAccount } from '@/lib/ws/clerk-orgs'
import { accountIdForOrg } from '@/lib/ws/onboarding'
import { WS_HOME_PATH, WS_SIGN_IN_PATH } from '@/lib/ws/paths'

export const metadata: Metadata = { title: 'Nový byznys' }

// Průvodce Nový byznys (S07). Kam koho poslat:
//   účet má a organizace je aktivní → rovnou do /w
//   účet má, organizace neaktivní    → aktivovat (ActivateAccount)
//   účet nemá                         → průvodce

export default async function NovyPage() {
  const { userId, orgId } = await auth()
  if (!userId) redirect(WS_SIGN_IN_PATH)
  if (orgId && (await accountIdForOrg(orgId))) redirect(WS_HOME_PATH)

  const existing = await orgWithAccount(userId)
  if (existing) return <ActivateAccount orgId={existing} />

  return <NewBusinessWizard industries={industrySummaries()} />
}
