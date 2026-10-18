'use client'

import Link from 'next/link'
import { CalendarSearch, CalendarX2, MoreHorizontal, Plus } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/ws/utils'

/**
 * Akce v hlavičce Kalendáře: jedna hlavní „Rezervace“ a vedle ní menu
 * s Najít volný čas a Blokace (dovolená, zavřeno). Odkazy otevírají pravý
 * panel (?detail=…); bez zapnuté nové rezervace se nevykreslí nic (R-043).
 */
export function CalendarActions({
  bookHref,
  findHref,
  blockHref,
}: {
  bookHref: string | null
  findHref: string | null
  blockHref: string | null
}) {
  if (!bookHref) return null
  return (
    <>
      <Link href={bookHref} scroll={false} className={buttonVariants()}>
        <Plus aria-hidden size={18} strokeWidth={1.5} />
        Rezervace
      </Link>
      {(findHref || blockHref) && (
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Další akce kalendáře"
            className={cn(buttonVariants({ variant: 'outline', size: 'icon' }))}
          >
            <MoreHorizontal aria-hidden size={20} strokeWidth={1.5} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {findHref && (
              <DropdownMenuItem asChild>
                <Link href={findHref} scroll={false}>
                  <CalendarSearch aria-hidden size={18} strokeWidth={1.5} />
                  Najít volný čas
                </Link>
              </DropdownMenuItem>
            )}
            {blockHref && (
              <DropdownMenuItem asChild>
                <Link href={blockHref} scroll={false}>
                  <CalendarX2 aria-hidden size={18} strokeWidth={1.5} />
                  Blokace (dovolená, zavřeno)
                </Link>
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </>
  )
}
