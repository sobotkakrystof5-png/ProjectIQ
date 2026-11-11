import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/ws/utils'
import { pageCount, type TableLinks, type TableParams } from '@/lib/admin-table'

/**
 * Stránkování (AD07). Obyčejné odkazy se stránkou v adrese — funguje
 * tlačítko Zpět a odkaz na konkrétní stránku jde poslat.
 *
 * Používá ho sdílená tabulka i seznamy karet (Požadavky, Poptávky), aby
 * se „Předchozí / Další" chovalo v celém adminu stejně.
 */
export function Pagination({
  params,
  total,
  links,
  className,
}: {
  params: TableParams
  total: number
  links: TableLinks
  className?: string
}) {
  const pages = pageCount(total, params.pageSize)
  if (pages <= 1) return null

  const step = 'inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition-colors'
  const active = 'text-navy-900 hover:bg-navy-100'
  const off = 'text-quiet opacity-40'

  return (
    <nav aria-label="Stránkování" className={cn('flex items-center justify-between gap-3', className)}>
      <p className="font-num text-xs text-quiet">
        {params.page}. stránka z {pages}
      </p>
      <div className="flex items-center gap-1">
        {params.page > 1 ? (
          <Link href={links.pageHref(params.page - 1)} className={cn(step, active)}>
            <ChevronLeft size={15} strokeWidth={1.5} />
            Předchozí
          </Link>
        ) : (
          <span className={cn(step, off)} aria-hidden>
            <ChevronLeft size={15} strokeWidth={1.5} />
            Předchozí
          </span>
        )}
        {params.page < pages ? (
          <Link href={links.pageHref(params.page + 1)} className={cn(step, active)}>
            Další
            <ChevronRight size={15} strokeWidth={1.5} />
          </Link>
        ) : (
          <span className={cn(step, off)} aria-hidden>
            Další
            <ChevronRight size={15} strokeWidth={1.5} />
          </span>
        )}
      </div>
    </nav>
  )
}
