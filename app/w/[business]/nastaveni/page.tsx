import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronRight, Globe } from 'lucide-react'
import { DetailSlot } from '@/components/ws/app/detail-slot'
import { AccentHeading } from '@/components/ws/brand'
import { hasRole, requireBusiness, requireWorkspace } from '@/lib/ws/context'
import { navHref } from '@/lib/ws/nav'
import { pragueToday } from '@/lib/ws/time'

export const metadata: Metadata = { title: 'Nastavení' }

type SearchParams = Record<string, string | string[] | undefined>

// Rozcestník Nastavení. Zatím jen Napojený web (S11); služby, kolonky,
// stavy, otevírací dobu a tým přidá S13 (R-043: neukazovat nehotové).
export default async function SettingsPage({
  params,
  searchParams,
}: {
  params: { business: string }
  searchParams: SearchParams
}) {
  const ctx = await requireWorkspace()
  const business = await requireBusiness(ctx, params.business)
  const pathname = navHref(business.slug, 'nastaveni')
  const owner = hasRole(ctx, 'owner')

  return (
    <div className="mx-auto flex max-w-[880px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <AccentHeading>Nastavení</AccentHeading>
      {owner ? (
        <ul className="flex flex-col gap-3">
          <li>
            <Link
              href={`${pathname}/web`}
              className="flex min-h-[72px] items-center gap-4 rounded-panel border border-navy-100 bg-surface px-5 py-4 transition-colors hover:border-navy-300"
            >
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-chip bg-navy-50 text-navy-700">
                <Globe aria-hidden size={22} strokeWidth={1.5} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-[16px] font-semibold text-ink">Napojený web</span>
                <span className="text-[14px] text-quiet">Odkaz na objednání, QR kód, widget a napojení vašeho webu</span>
              </span>
              <ChevronRight aria-hidden size={20} strokeWidth={1.5} className="text-quiet" />
            </Link>
          </li>
        </ul>
      ) : (
        <p className="text-[15px] text-quiet">Nastavení firmy mění majitel účtu.</p>
      )}
      <p className="text-[14px] text-quiet">Služby, kolonky, otevírací dobu a tým tu brzy upravíte taky.</p>
      <DetailSlot ctx={ctx} business={business} pathname={pathname} searchParams={searchParams} today={pragueToday()} />
    </div>
  )
}
