import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { AccentHeading } from '@/components/ws/brand'
import { ModuleSettings } from '@/components/ws/settings/module-settings'
import { canWrite, getBillingState } from '@/lib/ws/billing'
import { requireBusiness, requireRole, requireWorkspace } from '@/lib/ws/context'
import { navHref } from '@/lib/ws/nav'
import { getSettingsData } from '@/lib/ws/settings'
import { portalRules } from '@/lib/ws/portal-rules'
export default async function FunctionSettingsPage(props: { params: Promise<{ business: string }> }) {
  const params = await props.params
  const ctx = await requireWorkspace();const business = await requireBusiness(ctx, params.business);requireRole(ctx, 'owner');const [data, billing] = await Promise.all([getSettingsData(ctx, business), getBillingState(ctx.accountId)]);return <main className="mx-auto flex max-w-[800px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8"><Link href={navHref(business.slug,'nastaveni')} className="-ml-2 inline-flex min-h-11 items-center gap-1 self-start rounded-full px-2 text-[15px] text-quiet hover:text-ink"><ChevronLeft size={18}/>Nastavení</Link><AccentHeading>Funkce</AccentHeading><p className="text-[15px] text-quiet">Zapnuté funkce najdete v menu. Když je vypnete, jejich data zůstanou uložená.</p><ModuleSettings slug={business.slug} modules={data.modules} readOnly={!canWrite(billing)} portalRules={portalRules(business.settings)}/></main>
}
