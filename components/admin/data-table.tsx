import Link from 'next/link'
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown } from 'lucide-react'
import { EmptyState } from '@/components/ws/brand'
import { cn } from '@/lib/ws/utils'
import { flipDir, pageCount, rangeLabel, type SortDir, type TableLinks, type TableParams } from '@/lib/admin-table'

/**
 * Jedna tabulka pro celý admin (AD07).
 *
 * Je to **serverová** komponenta: řazení i stránkování jsou obyčejné odkazy se
 * stavem v URL, takže se nic nehydratuje, funguje tlačítko Zpět a seřazený
 * seznam jde poslat odkazem. Interaktivní části (zatržítka, inline úpravy)
 * si volající vkládá jako hotové uzly přes `selection` a `cell`.
 *
 * Na telefonu se netlačí jedenáct sloupců do posuvníku — pod 640 px se ze
 * stejných dat kreslí karty podle rolí `mobile` (titulek, štítek, údaje).
 */

export type AdminColumnMobile = 'title' | 'meta' | 'badge' | 'hidden'

export type AdminColumn<T> = {
  /** Klíč řazení; musí být v `allowed` u `parseTableParams`. */
  key: string
  header: string
  sortable?: boolean
  align?: 'left' | 'right'
  /** Směr při prvním kliknutí (data a částky odshora dolů). */
  defaultDir?: SortDir
  /** Šířka sloupce, když se má držet (např. `w-28`). */
  className?: string
  cell: (row: T) => React.ReactNode
  /** Role na telefonu. Výchozí `meta`. */
  mobile?: AdminColumnMobile
}

export type AdminTableSelection<T> = {
  /** Zatržítko v hlavičce (vybrat vše). */
  header?: React.ReactNode
  cell: (row: T) => React.ReactNode
}

export type AdminTablePage = {
  params: TableParams
  total: number
  links: TableLinks
}

export type AdminTableProps<T> = {
  rows: T[]
  columns: AdminColumn<T>[]
  rowKey: (row: T) => string
  /** Odkaz na detail řádku. Na telefonu je odkazem celá karta. */
  href?: (row: T) => string
  /** Aktuální řazení a odkazy na jeho změnu. Bez něj se hlavička neřadí. */
  sort?: { params: TableParams; links: TableLinks }
  /** Stránkování. Bez něj se patička se stránkami nekreslí. */
  page?: AdminTablePage
  empty: { title: string; description: string; action?: React.ReactNode }
  /** Řádek nad tabulkou (filtry, hledání). */
  toolbar?: React.ReactNode
  /** Vlastní patička (součty) nad stránkováním. */
  footer?: React.ReactNode
  selection?: AdminTableSelection<T>
  className?: string
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ChevronsUpDown size={13} strokeWidth={1.5} className="shrink-0 opacity-0 transition-opacity group-hover:opacity-60" />
  return dir === 'asc' ? (
    <ArrowUp size={13} strokeWidth={1.5} className="shrink-0" />
  ) : (
    <ArrowDown size={13} strokeWidth={1.5} className="shrink-0" />
  )
}

function HeaderCell<T>({ column, sort }: { column: AdminColumn<T>; sort?: { params: TableParams; links: TableLinks } }) {
  const align = column.align === 'right' ? 'text-right' : 'text-left'
  const base = cn('px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-quiet', align, column.className)

  if (!column.sortable || !sort) return <th className={base}>{column.header}</th>

  const active = sort.params.sortKey === column.key
  const nextDir = active ? flipDir(sort.params.dir) : (column.defaultDir ?? 'desc')
  return (
    <th className={base} aria-sort={active ? (sort.params.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <Link
        href={sort.links.sortHref(column.key, nextDir)}
        scroll={false}
        className={cn(
          'group inline-flex items-center gap-1.5 rounded-tiny px-1 py-1 -mx-1 uppercase transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          column.align === 'right' && 'flex-row-reverse',
          active && 'text-ink',
        )}
      >
        {column.header}
        <SortIcon active={active} dir={sort.params.dir} />
      </Link>
    </th>
  )
}

function Pagination({ page }: { page: AdminTablePage }) {
  const { params, total, links } = page
  const pages = pageCount(total, params.pageSize)
  if (pages <= 1) return null
  const prev = params.page > 1
  const next = params.page < pages
  const step = cn(
    'inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition-colors',
    'text-navy-900 hover:bg-navy-100',
  )
  return (
    <nav aria-label="Stránkování" className="flex items-center justify-between gap-3 border-t border-navy-100 px-3 py-2">
      <p className="font-num text-xs text-quiet">
        {params.page}. stránka z {pages}
      </p>
      <div className="flex items-center gap-1">
        {prev ? (
          <Link href={links.pageHref(params.page - 1)} className={step}>
            <ChevronLeft size={15} strokeWidth={1.5} />
            Předchozí
          </Link>
        ) : (
          <span className={cn(step, 'text-quiet opacity-40')} aria-hidden>
            <ChevronLeft size={15} strokeWidth={1.5} />
            Předchozí
          </span>
        )}
        {next ? (
          <Link href={links.pageHref(params.page + 1)} className={step}>
            Další
            <ChevronRight size={15} strokeWidth={1.5} />
          </Link>
        ) : (
          <span className={cn(step, 'text-quiet opacity-40')} aria-hidden>
            Další
            <ChevronRight size={15} strokeWidth={1.5} />
          </span>
        )}
      </div>
    </nav>
  )
}

/** Karta jednoho řádku na telefonu — stejná data, jiné rozložení. */
function MobileCard<T>({
  row,
  columns,
  href,
  selection,
}: {
  row: T
  columns: AdminColumn<T>[]
  href?: string
  selection?: AdminTableSelection<T>
}) {
  const title = columns.find((c) => c.mobile === 'title') ?? columns[0]
  const badges = columns.filter((c) => c.mobile === 'badge')
  const meta = columns.filter((c) => c !== title && c.mobile !== 'badge' && c.mobile !== 'hidden')

  const head = (
    <div className="flex items-start justify-between gap-3">
      <span className="text-[15px] font-semibold text-ink">{title.cell(row)}</span>
      {badges.length > 0 && <span className="flex shrink-0 flex-wrap items-center gap-1.5">{badges.map((c) => <span key={c.key}>{c.cell(row)}</span>)}</span>}
    </div>
  )

  return (
    <li className="relative border-t border-navy-100 px-4 py-3 first:border-t-0">
      <div className="flex items-start gap-3">
        {selection && <span className="pt-1">{selection.cell(row)}</span>}
        <div className="min-w-0 flex-1">
          {href ? (
            <Link href={href} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-tiny after:absolute after:inset-0">
              {head}
            </Link>
          ) : (
            head
          )}
          {meta.length > 0 && (
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              {meta.map((c) => (
                <div key={c.key} className="contents">
                  <dt className="text-xs text-quiet">{c.header}</dt>
                  <dd className="text-sm text-ink">{c.cell(row)}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>
    </li>
  )
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  href,
  sort,
  page,
  empty,
  toolbar,
  footer,
  selection,
  className,
}: AdminTableProps<T>) {
  const titleKey = (columns.find((c) => c.mobile === 'title') ?? columns[0])?.key
  const total = page?.total ?? rows.length

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {(toolbar || page) && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <div className="min-w-0">{toolbar}</div>
          {page && rows.length > 0 && (
            <p className="font-num text-xs text-quiet">{rangeLabel(page.params, rows.length, total)}</p>
          )}
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState title={empty.title} description={empty.description} action={empty.action} />
      ) : (
        <div className="overflow-hidden rounded-box border border-navy-100 bg-surface">
          {/* Od 640 px tabulka, pod tím karty — stejná data, čitelné na telefonu. */}
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-navy-100 bg-navy-50">
                  {selection && <th className="w-10 px-3 py-2.5">{selection.header}</th>}
                  {columns.map((column) => (
                    <HeaderCell key={column.key} column={column} sort={sort} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const rowHref = href?.(row)
                  return (
                    <tr key={rowKey(row)} className="relative border-t border-navy-100 transition-colors first:border-t-0 hover:bg-navy-50/60">
                      {selection && <td className="px-3 py-2.5 align-top">{selection.cell(row)}</td>}
                      {columns.map((column) => (
                        <td
                          key={column.key}
                          className={cn(
                            'px-3 py-2.5 text-sm text-ink align-top',
                            column.align === 'right' && 'text-right',
                            column.className,
                          )}
                        >
                          {rowHref && column.key === titleKey ? (
                            <Link
                              href={rowHref}
                              className="font-medium text-ink after:absolute after:inset-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              {column.cell(row)}
                            </Link>
                          ) : (
                            column.cell(row)
                          )}
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <ul className="sm:hidden">
            {rows.map((row) => (
              <MobileCard key={rowKey(row)} row={row} columns={columns} href={href?.(row)} selection={selection} />
            ))}
          </ul>

          {footer}
          {page && <Pagination page={page} />}
        </div>
      )}
    </div>
  )
}
