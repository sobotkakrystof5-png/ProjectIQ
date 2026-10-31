import type { ReactNode } from 'react'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { AccentHeading } from '@/components/ws/brand'
import { navHref } from '@/lib/ws/nav'
import { ScrollToHash } from './scroll-to-hash'

export function SettingsPageShell({ businessSlug, title, children, width = 'max-w-[1040px]' }: {
  businessSlug: string
  title: string
  children: ReactNode
  width?: string
}) {
  return <main className={`mx-auto flex ${width} flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8`}>
    <Link href={navHref(businessSlug, 'nastaveni')} className="-ml-2 inline-flex min-h-11 items-center gap-1 self-start rounded-full px-2 text-[15px] font-medium text-quiet hover:text-ink">
      <ChevronLeft aria-hidden size={18} strokeWidth={1.5} />Nastavení
    </Link>
    <AccentHeading>{title}</AccentHeading>
    {children}
    <ScrollToHash />
  </main>
}
