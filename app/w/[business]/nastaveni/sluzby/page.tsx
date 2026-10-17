import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { AccentHeading } from '@/components/ws/brand'
import { ServiceSettings } from '@/components/ws/settings/service-settings'
import { canWrite, getBillingState } from '@/lib/ws/billing'
import { requireBusiness, requireRole, requireWorkspace } from '@/lib/ws/context'
import { navHref } from '@/lib/ws/nav'
import { getSettingsData } from '@/lib/ws/settings'
export default async function ServiceSettingsPage(props: { params: Promise<{ business: string }> }) {
  const params = await props.params
  const ctx = await requireWorkspace();const business = await requireBusiness(ctx, params.business);requireRole(ctx,'owner');const [data,billing] = await Promise.all([getSettingsData(ctx,business),getBillingState(ctx.accountId)]);return <main className="mx-auto flex max-w-[800px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8"><Link href={navHref(business.slug,'nastaveni')} className="-ml-2 inline-flex min-h-11 items-center gap-1 self-start rounded-full px-2 text-[15px] text-quiet hover:text-ink"><ChevronLeft size={18}/>Nastavení</Link><AccentHeading>Služby a ceník</AccentHeading><p className="text-[15px] text-quiet">Skrytá služba se nenabízí v nových poptávkách. Dřívější termíny zůstanou beze změny. Pořadí změníte přetažením, stejně ho uvidí zákazníci.</p><ServiceSettings slug={business.slug} services={data.services} staff={data.staff.filter((x) => x.active)} serviceStaff={data.serviceStaff} readOnly={!canWrite(billing)}/></main>
}
