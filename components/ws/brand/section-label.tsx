import { cn } from '@/lib/ws/utils'

/**
 * Štítek sekce „01 — CO TO UMÍ": JetBrains Mono, verzálky. Číslo jen tam, kde sekce jdou po sobě.
 * `as` je kvůli adminu (AD17): nadpis panelu má být `h2`, aby obrazovka měla osnovu pro čtečku.
 */
export function SectionLabel({
  number,
  onDark = false,
  as: Tag = 'p',
  className,
  children,
}: {
  number?: string
  onDark?: boolean
  as?: 'p' | 'h2' | 'h3'
  className?: string
  children: React.ReactNode
}) {
  return (
    <Tag
      className={cn(
        'font-num text-xs font-medium uppercase tracking-[0.12em]',
        onDark ? 'text-navy-400' : 'text-quiet',
        className,
      )}
    >
      {number && (
        <>
          <span className={onDark ? 'text-navy-300' : 'text-navy-500 dark:text-navy-300'}>{number}</span>
          <span aria-hidden> — </span>
        </>
      )}
      {children}
    </Tag>
  )
}
