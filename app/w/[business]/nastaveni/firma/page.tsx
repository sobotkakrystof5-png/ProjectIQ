import type { Metadata } from 'next'
import { AppearanceSettings } from '@/components/ws/settings/appearance-settings'
import { IssuerProfileForm } from '@/components/ws/money/issuer-profile-form'
import { SettingsPageShell } from '@/components/ws/settings/settings-page-shell'
import { canWrite, getBillingState } from '@/lib/ws/billing'
import { hasRole, requireBusiness, requireWorkspace } from '@/lib/ws/context'
import { getIssuerProfile } from '@/lib/ws/money/data'

export const metadata: Metadata = { title: 'Firma · Nastavení' }

export default async function CompanySettingsPage(props: { params: Promise<{ business: string }> }) {
  const { business: slug } = await props.params
  const ctx = await requireWorkspace()
  const business = await requireBusiness(ctx, slug)
  if (!hasRole(ctx, 'owner')) return <SettingsPageShell businessSlug={slug} title="Firma"><p className="text-[15px] text-quiet">Nastavení firmy mění majitel účtu.</p></SettingsPageShell>
  const [profile, billing] = await Promise.all([getIssuerProfile(ctx), getBillingState(ctx.accountId)])
  const readOnly = !canWrite(billing)

  return <SettingsPageShell businessSlug={business.slug} title="Firma">
    <nav aria-label="Části nastavení firmy" className="flex flex-wrap gap-2">
      {[['udaje', 'Fakturační údaje'], ['vzhled', 'Vzhled']].map(([id, label]) => <a key={id} href={`#${id}`} className="inline-flex min-h-11 items-center rounded-full border border-navy-100 bg-surface px-4 text-sm font-medium text-ink hover:bg-navy-50">{label}</a>)}
    </nav>
    <section id="udaje" className="scroll-mt-6 flex flex-col gap-3">
      <h2 className="text-[18px] font-semibold text-ink">Fakturační údaje</h2>
      <IssuerProfileForm slug={business.slug} profile={profile} readOnly={readOnly} />
    </section>
    <section id="vzhled" className="scroll-mt-6 flex flex-col gap-3">
      <h2 className="text-[18px] font-semibold text-ink">Vzhled</h2>
      <AppearanceSettings slug={business.slug} color={business.color} readOnly={readOnly} />
    </section>
  </SettingsPageShell>
}
