import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { AccentHeading } from '@/components/ws/brand'
import { AppearanceSettings } from '@/components/ws/settings/appearance-settings'
import { canWrite, getBillingState } from '@/lib/ws/billing'
import { requireBusiness, requireRole, requireWorkspace } from '@/lib/ws/context'
import { navHref } from '@/lib/ws/nav'
export default async function AppearancePage({ params }: { params: { business: string } }) { const ctx=await requireWorkspace(); const business=await requireBusiness(ctx,params.business); requireRole(ctx,'owner'); const billing=await getBillingState(ctx.accountId); return <main className="mx-auto flex max-w-[800px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8"><Link href={navHref(business.slug,'nastaveni')} className="-ml-2 inline-flex min-h-11 items-center gap-1 self-start rounded-full px-2 text-[15px] text-quiet hover:text-ink"><ChevronLeft size={18}/>Nastavení</Link><AccentHeading>Vzhled</AccentHeading><AppearanceSettings slug={business.slug} color={business.color} readOnly={!canWrite(billing)}/></main> }
