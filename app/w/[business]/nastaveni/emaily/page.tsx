import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { AccentHeading } from '@/components/ws/brand'
import { EmailSettings } from '@/components/ws/settings/email-settings'
import { canWrite, getBillingState } from '@/lib/ws/billing'
import { requireBusiness, requireRole, requireWorkspace } from '@/lib/ws/context'
import { getEmailSettings } from '@/lib/ws/email/settings'
import { navHref } from '@/lib/ws/nav'

export const metadata: Metadata = { title: 'E-maily a upozornění' }

export default async function EmailSettingsPage({ params }: { params: { business: string } }) {
  const ctx = await requireWorkspace()
  const business = await requireBusiness(ctx, params.business)
  requireRole(ctx, 'owner')
  const [data, billing] = await Promise.all([getEmailSettings(ctx, business), getBillingState(ctx.accountId)])
  return (
    <main className="mx-auto flex max-w-[1040px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <Link href={navHref(business.slug, 'nastaveni')} className="-ml-2 inline-flex min-h-11 items-center gap-1 self-start rounded-full px-2 text-[15px] text-quiet hover:text-ink">
        <ChevronLeft size={18} />
        Nastavení
      </Link>
      <AccentHeading>E-maily a upozornění</AccentHeading>
      <p className="text-[15px] text-quiet">Vyberte, co a komu se posílá. Text každého e-mailu zákazníkům můžete upravit a hned vidíte, jak bude vypadat.</p>
      {!data.sendingReady && (
        <p className="rounded-chip bg-navy-50 px-4 py-3 text-[15px] text-navy-900 dark:bg-navy-800 dark:text-navy-50">
          Odesílání e-mailů ještě dokončujeme. Texty a přepínače si můžete připravit, e-maily začnou chodit, jakmile ho zapneme.
        </p>
      )}
      <EmailSettings
        slug={business.slug}
        brand={{ name: business.name, color: business.color }}
        rows={data.rows}
        replyTo={data.replyTo}
        ownerEmail={data.ownerEmail}
        newsEmails={data.newsEmails}
        readOnly={!canWrite(billing)}
      />
    </main>
  )
}
