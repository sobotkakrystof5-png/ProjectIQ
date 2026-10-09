'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { CalendarPlus, FilePlus2, Link2, Plus, Search } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { buttonVariants } from '@/components/ui/button'
import { hrefWith } from '@/lib/ws/detail-param'
import type { NewAction } from '@/lib/ws/features'
import { cn } from '@/lib/ws/utils'
import { copyOrderLink } from './copy-order-link'

/**
 * „+ Nová" — jediná hlavní akce kostry. V hlavičce jako pilulka, ve spodní
 * liště na telefonu jako kulaté tlačítko uprostřed. Formuláře se otevírají
 * v pravém panelu (?detail=…). Nabízí jen hotové akce (R-043).
 */
export function NewMenu({
  variant,
  actions,
  orderUrl,
  onSearch,
}: {
  variant: 'header' | 'bar'
  /** Jen hotové akce (lib/ws/features.ts). Prázdný seznam = tlačítko se nevykreslí. */
  actions: NewAction[]
  orderUrl: string
  onSearch: () => void
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  if (actions.length === 0) return null
  const open = (detail: string) =>
    router.push(hrefWith(pathname, Object.fromEntries(searchParams.entries()), { detail }), { scroll: false })

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          variant === 'header'
            ? buttonVariants({ variant: 'primary', size: 'md' })
            : 'flex h-14 w-14 -translate-y-3 items-center justify-center rounded-full bg-navy-700 text-white shadow-lg shadow-navy-950/25 transition-colors duration-200 ease-zq hover:bg-navy-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        )}
        aria-label={variant === 'bar' ? 'Nová' : undefined}
      >
        <Plus aria-hidden size={variant === 'bar' ? 26 : 18} strokeWidth={1.5} />
        {variant === 'header' && 'Nová'}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={variant === 'header' ? 'end' : 'center'} side={variant === 'bar' ? 'top' : 'bottom'}>
        {actions.includes('booking') && (
          <DropdownMenuItem onSelect={() => open('nova-rezervace')}>
            <CalendarPlus size={18} strokeWidth={1.5} />
            Nová rezervace
          </DropdownMenuItem>
        )}
        {actions.includes('invoice') && (
          <DropdownMenuItem onSelect={() => open('nova-faktura')}>
            <FilePlus2 size={18} strokeWidth={1.5} />
            Nová faktura
          </DropdownMenuItem>
        )}
        {actions.includes('link') && (
          <DropdownMenuItem onSelect={() => void copyOrderLink(orderUrl)}>
            <Link2 size={18} strokeWidth={1.5} />
            Zkopírovat odkaz na objednání
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onSearch}>
          <Search size={18} strokeWidth={1.5} />
          Hledat
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
