import type { Metadata } from 'next'
import { LoyaltySettings } from '@/components/ws/settings/loyalty-settings'
import { SegmentSettings } from '@/components/ws/settings/segment-settings'
import { SettingsPageShell } from '@/components/ws/settings/settings-page-shell'
import { canWrite, getBillingState } from '@/lib/ws/billing'
import { getBookingOptions } from '@/lib/ws/calendar'
import { hasRole, requireBusiness, requireWorkspace } from '@/lib/ws/context'
import { getLoyaltyProgram } from '@/lib/ws/loyalty'
import { getSegmentRules } from '@/lib/ws/segments'

export const metadata: Metadata = { title: 'Zákazníci · Nastavení' }

export default async function CustomerSettingsPage(props: { params: Promise<{ business: string }> }) {
  const { business: slug } = await props.params
  const ctx = await requireWorkspace()
  const business = await requireBusiness(ctx, slug)
  if (!hasRole(ctx, 'owner')) return <SettingsPageShell businessSlug={slug} title="Zákazníci"><p className="text-[15px] text-quiet">Nastavení firmy mění majitel účtu.</p></SettingsPageShell>
  const [program, options, rules, billing] = await Promise.all([
    getLoyaltyProgram(ctx, business),
    getBookingOptions(ctx, business),
    getSegmentRules(ctx, business),
    getBillingState(ctx.accountId),
  ])

  return <SettingsPageShell businessSlug={business.slug} title="Zákazníci">
    <nav aria-label="Části zákaznických nastavení" className="flex flex-wrap gap-2">
      {[['vernost', 'Věrnost'], ['skupiny', 'Skupiny']].map(([id, label]) => <a key={id} href={`#${id}`} className="inline-flex min-h-11 items-center rounded-full border border-navy-100 bg-surface px-4 text-sm font-medium text-ink hover:bg-navy-50">{label}</a>)}
    </nav>
    <section id="vernost" className="scroll-mt-6 flex flex-col gap-3">
      <h2 className="text-[18px] font-semibold text-ink">Věrnostní karta</h2>
      <LoyaltySettings slug={business.slug} businessName={business.name} businessColor={business.color} program={program} services={options.services.map((service) => ({ id: service.id, name: service.name }))} readOnly={!canWrite(billing)} />
    </section>
    <section id="skupiny" className="scroll-mt-6 flex flex-col gap-3">
      <div><h2 className="text-[18px] font-semibold text-ink">Skupiny zákazníků</h2><p className="text-sm text-quiet">Každý zákazník je v jedné skupině. Počítá se z návštěv a zakázek.</p></div>
      <SegmentSettings slug={business.slug} rules={rules} readOnly={!canWrite(billing)} />
    </section>
  </SettingsPageShell>
}
