import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { AccentHeading } from '@/components/ws/brand'
import { IssuerProfileForm } from '@/components/ws/money/issuer-profile-form'
import { canWrite,getBillingState } from '@/lib/ws/billing'
import { requireBusiness,requireRole,requireWorkspace } from '@/lib/ws/context'
import { getIssuerProfile } from '@/lib/ws/money/data'
import { navHref } from '@/lib/ws/nav'

export const metadata:Metadata={title:'Firma a fakturace'}

export default async function CompanySettingsPage(props:{params:Promise<{business:string}>}) {
  const params=await props.params
  const ctx=await requireWorkspace()
  const business=await requireBusiness(ctx,params.business)
  requireRole(ctx,'owner')
  const [profile,billing]=await Promise.all([getIssuerProfile(ctx),getBillingState(ctx.accountId)])
  return <main className="mx-auto flex max-w-[800px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
    <Link href={navHref(business.slug,'nastaveni')} className="-ml-2 inline-flex min-h-11 items-center gap-1 self-start rounded-full px-2 text-[15px] text-quiet hover:text-ink"><ChevronLeft size={18}/>Nastavení</Link>
    <AccentHeading>Firma a fakturace</AccentHeading>
    <IssuerProfileForm slug={business.slug} profile={profile} readOnly={!canWrite(billing)}/>
  </main>
}
