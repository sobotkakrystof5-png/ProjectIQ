import type { Metadata } from 'next'
import { EmailSettings } from '@/components/ws/settings/email-settings'
import { SettingsPageShell } from '@/components/ws/settings/settings-page-shell'
import { canWrite, getBillingState } from '@/lib/ws/billing'
import { hasRole, requireBusiness, requireWorkspace } from '@/lib/ws/context'
import { getEmailSettings } from '@/lib/ws/email/settings'

export const metadata: Metadata = { title: 'Komunikace · Nastavení' }

export default async function CommunicationSettingsPage(props: { params: Promise<{ business: string }> }) {
  const { business: slug } = await props.params
  const ctx = await requireWorkspace()
  const business = await requireBusiness(ctx, slug)
  if (!hasRole(ctx, 'owner')) return <SettingsPageShell businessSlug={business.slug} title="Komunikace"><p className="text-[15px] text-quiet">Nastavení firmy mění majitel účtu.</p></SettingsPageShell>
  const [data, billing] = await Promise.all([getEmailSettings(ctx, business), getBillingState(ctx.accountId)])

  return <SettingsPageShell businessSlug={business.slug} title="Komunikace">
    {!data.sendingReady && <p className="rounded-chip bg-navy-50 px-4 py-3 text-[15px] text-navy-900 dark:bg-navy-800 dark:text-navy-50">Odesílání e-mailů zatím není zapnuté. Texty si můžete připravit a použít je přes svůj poštovní program.</p>}
    <EmailSettings slug={business.slug} brand={{ name: business.name, color: business.color }} rows={data.rows} replyTo={data.replyTo} ownerEmail={data.ownerEmail} newsEmails={data.newsEmails} portal={data.portal} readOnly={!canWrite(billing)} />
  </SettingsPageShell>
}
