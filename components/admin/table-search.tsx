import { Search } from 'lucide-react'
import { cn } from '@/lib/ws/utils'
import type { SearchParamsLike } from '@/lib/admin-table'

/**
 * Hledání nad sdílenou tabulkou (AD07).
 *
 * Je to obyčejný formulář s `method="get"`: po Enteru se hledaný text objeví
 * v adrese a stránka se znovu vykreslí na serveru. Nic se nehydratuje,
 * odkaz s hledáním jde poslat a tlačítko Zpět funguje.
 *
 * Ostatní parametry (filtry, řazení) putují dál ve skrytých polích, jinak by
 * je odeslání formuláře zahodilo. Stránka se záměrně nepřenáší — po novém
 * hledání se začíná od první.
 */
export function TableSearch({
  action,
  searchParams,
  name = 'q',
  placeholder,
  label = 'Hledat',
  className,
}: {
  /** Adresa obrazovky, např. `/dashboard/faktury`. */
  action: string
  searchParams: SearchParamsLike
  name?: string
  placeholder: string
  label?: string
  className?: string
}) {
  const keep: { key: string; value: string }[] = []
  for (const [key, value] of Object.entries(searchParams ?? {})) {
    if (key === name || key === 'page' || value === undefined) continue
    for (const item of Array.isArray(value) ? value : [value]) keep.push({ key, value: item })
  }
  const current = searchParams?.[name]
  const value = Array.isArray(current) ? current[0] : current

  return (
    <form action={action} method="get" role="search" className={cn('relative min-w-[220px] flex-1', className)}>
      {keep.map((item, index) => (
        <input key={`${item.key}-${index}`} type="hidden" name={item.key} value={item.value} />
      ))}
      <Search
        size={15}
        strokeWidth={1.5}
        aria-hidden
        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-quiet"
      />
      <input
        type="search"
        name={name}
        defaultValue={value ?? ''}
        aria-label={label}
        placeholder={placeholder}
        className="h-11 w-full rounded-full border border-input bg-surface pl-10 pr-4 text-[15px] text-ink transition-colors placeholder:text-quiet focus-visible:border-navy-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
      />
    </form>
  )
}
