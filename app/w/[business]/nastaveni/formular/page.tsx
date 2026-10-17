import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { AccentHeading } from '@/components/ws/brand'
import { FieldSettings } from '@/components/ws/settings/field-settings'
import { canWrite, getBillingState } from '@/lib/ws/billing'
import { requireBusiness, requireRole, requireWorkspace } from '@/lib/ws/context'
import { navHref } from '@/lib/ws/nav'
import { getSettingsData } from '@/lib/ws/settings'
export default async function FormSettingsPage(props: { params: Promise<{ business: string }> }) {
  const params = await props.params
  const ctx = await requireWorkspace();const business = await requireBusiness(ctx,params.business);requireRole(ctx,'owner');const [data,billing] = await Promise.all([getSettingsData(ctx,business),getBillingState(ctx.accountId)]);return <main className="mx-auto flex max-w-[1040px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8"><Link href={navHref(business.slug,'nastaveni')} className="-ml-2 inline-flex min-h-11 items-center gap-1 self-start rounded-full px-2 text-[15px] text-quiet hover:text-ink"><ChevronLeft size={18}/>Nastavení</Link><AccentHeading>Formulář poptávky</AccentHeading><p className="text-[15px] text-quiet">Změna se hned projeví v objednávací stránce i v popisu veřejného API. Pořadí kolonek změníte přetažením.</p><FieldSettings slug={business.slug} fields={data.fields} readOnly={!canWrite(billing)}/></main>
}
