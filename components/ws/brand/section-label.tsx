import { cn } from '@/lib/ws/utils'

/** Štítek sekce „01 — CO TO UMÍ": JetBrains Mono, verzálky. Číslo jen tam, kde sekce jdou po sobě. */
export function SectionLabel({
  number,
  onDark = false,
  className,
  children,
}: {
  number?: string
  onDark?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <p
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
    </p>
  )
}
