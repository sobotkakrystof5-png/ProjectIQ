import type { Metadata } from 'next'
import Link from 'next/link'
import { Building2, ChevronRight, ClipboardList, Package, Users, Mail } from 'lucide-react'
import { ModuleSettings } from '@/components/ws/settings/module-settings'
import { DetailSlot } from '@/components/ws/app/detail-slot'
import { AccentHeading } from '@/components/ws/brand'
import { canWrite, getBillingState } from '@/lib/ws/billing'
import { hasRole, requireBusiness, requireWorkspace } from '@/lib/ws/context'
import { navHref } from '@/lib/ws/nav'
import { getSettingsData } from '@/lib/ws/settings'
import { getIndustryTemplate } from '@/lib/ws/templates'
import { portalRules } from '@/lib/ws/portal-rules'
import { pragueToday } from '@/lib/ws/time'

export const metadata: Metadata = { title: 'Nastavení' }

type SearchParams = Record<string, string | string[] | undefined>

const SECTIONS = [
  { path: 'firma', icon: Building2, title: 'Firma', text: 'Fakturační údaje a vzhled' },
  { path: 'nabidka', icon: Package, title: 'Nabídka', text: 'Služby, otevírací doba a pracovníci' },
  { path: 'objednavky', icon: ClipboardList, title: 'Objednávky', text: 'Formulář, stavy zakázek a napojený web' },
  { path: 'zakaznici', icon: Users, title: 'Zákazníci', text: 'Věrnostní karty a skupiny' },
  { path: 'komunikace', icon: Mail, title: 'Komunikace', text: 'E-maily, upozornění a zprávy zákazníkům' },
] as const

export default async function SettingsPage(props: {
  params: Promise<{ business: string }>
  searchParams: Promise<SearchParams>
}) {
  const searchParams = await props.searchParams
  const params = await props.params
  const ctx = await requireWorkspace()
  const business = await requireBusiness(ctx, params.business)
  const pathname = navHref(business.slug, 'nastaveni')
  const owner = hasRole(ctx, 'owner')
  const [data, billing] = owner
    ? await Promise.all([getSettingsData(ctx, business), getBillingState(ctx.accountId)])
    : [null, null]
  const template = getIndustryTemplate(business.industry)

  return <div className="mx-auto flex max-w-[880px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
    <AccentHeading>Nastavení</AccentHeading>
    {owner && data && billing ? <>
      <section id="funkce" className="scroll-mt-6 rounded-panel border border-navy-100 bg-surface p-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-[18px] font-semibold text-ink">Co v aplikaci používáte?</h2>
          <p className="text-sm text-quiet">Začínáte s výběrem pro obor {template.label}. Vypnutím funkce se schová její nabídka; uložená data zůstanou.</p>
        </div>
        <details className="mt-3">
          <summary className="inline-flex min-h-11 cursor-pointer items-center rounded-full px-3 text-sm font-semibold text-navy-700 underline-offset-4 hover:underline dark:text-navy-200">Upravit funkce</summary>
          <div className="pt-3"><ModuleSettings slug={business.slug} modules={data.modules} readOnly={!canWrite(billing)} portalRules={portalRules(business.settings)} /></div>
        </details>
      </section>
      <nav aria-label="Sekce nastavení" className="flex flex-col gap-3">
        {SECTIONS.map(({ path, icon: Icon, title, text }) => <Link key={path} href={`${pathname}/${path}`} className="flex min-h-[72px] items-center gap-4 rounded-panel border border-navy-100 bg-surface px-5 py-4 transition-colors hover:border-navy-300">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-chip bg-navy-50 text-navy-700"><Icon aria-hidden size={22} strokeWidth={1.5} /></span>
          <span className="flex min-w-0 flex-1 flex-col"><span className="text-[16px] font-semibold text-ink">{title}</span><span className="text-[14px] text-quiet">{text}</span></span>
          <ChevronRight aria-hidden size={20} strokeWidth={1.5} className="text-quiet" />
        </Link>)}
      </nav>
    </> : <p className="text-[15px] text-quiet">Nastavení firmy mění majitel účtu.</p>}
    <DetailSlot ctx={ctx} business={business} pathname={pathname} searchParams={searchParams} today={pragueToday()} />
  </div>
}
