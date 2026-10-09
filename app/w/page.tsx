import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getBillingState } from '@/lib/ws/billing'
import { requireWorkspace } from '@/lib/ws/context'
import { LAST_BUSINESS_COOKIE, WS_ONBOARDING_PATH } from '@/lib/ws/paths'
import { getBusinesses } from '@/lib/ws/today'

type SearchParams = Record<string, string | string[] | undefined>

// /w jen přesměruje na naposledy otevřený byznys (cookie z kostry aplikace),
// jinak na první. `?vitejte=1` (návrat z předplatného, S08) jde s sebou,
// obrazovka Dnes podle něj přivítá.
export default async function WorkspaceHome({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireWorkspace()
  const [billing, businesses] = await Promise.all([getBillingState(ctx.accountId), getBusinesses(ctx)])
  if (billing.access === 'none' || businesses.length === 0) redirect(WS_ONBOARDING_PATH)

  const remembered = cookies().get(LAST_BUSINESS_COOKIE)?.value
  const target = businesses.find((b) => b.slug === remembered) ?? businesses[0]
  const welcome = searchParams.vitejte === '1' ? '?vitejte=1' : ''
  redirect(`/w/${target.slug}${welcome}`)
}
