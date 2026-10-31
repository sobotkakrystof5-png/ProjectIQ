import { cn } from '@/lib/ws/utils'

const sizes = {
  // landing H1 88 px
  hero: 'text-[40px] leading-[0.98] tracking-[-0.035em] sm:text-[64px] lg:text-[88px]',
  // landing H2 56 px
  section: 'text-[28px] leading-[1.02] tracking-[-0.03em] sm:text-[44px] lg:text-[56px]',
  // nadpis obrazovky v aplikaci 28–36 px
  page: 'text-[28px] leading-[1.05] tracking-[-0.03em] sm:text-[36px]',
  // menší nadpis v aplikaci 28 px
  title: 'text-[24px] leading-[1.1] tracking-[-0.02em] sm:text-[28px]',
}

/**
 * Nadpis s akcentem: první část Instrument Sans 600, druhá serifová kurzíva.
 * „Každá poptávka *na svém místě.*" — akcent max. jednou na obrazovce, nikdy v tabulkách a formulářích.
 */
export function AccentHeading({
  as: Tag = 'h1',
  id,
  size = 'page',
  accent,
  onDark = false,
  className,
  children,
}: {
  as?: 'h1' | 'h2' | 'h3'
  /** Pro `aria-labelledby` sekce. */
  id?: string
  size?: keyof typeof sizes
  accent?: React.ReactNode
  onDark?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <Tag id={id} className={cn('font-semibold', sizes[size], onDark ? 'text-white' : 'text-ink', className)}>
      {children}
      {accent && (
        <>
          {' '}
          <em
            className={cn(
              'font-accent font-normal italic tracking-[-0.01em]',
              onDark ? 'text-navy-300' : 'text-navy-500 dark:text-navy-300',
            )}
          >
            {accent}
          </em>
        </>
      )}
    </Tag>
  )
}
