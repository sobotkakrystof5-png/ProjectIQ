import { AccentHeading } from '@/components/ws/brand'
import { cn } from '@/lib/ws/utils'

const WIDTH = {
  /** Seznamy s jedním sloupcem (Poptávky). */
  narrow: 'max-w-[960px]',
  /** Seznam + detail (Zákazníci, Peníze). */
  default: 'max-w-[1280px]',
  /** Kalendář a Dnes. */
  wide: 'max-w-[1440px]',
} as const

/**
 * Kořen obrazovky byznysu (RD04): šířka, okraje a svislý rytmus 24 px jsou
 * pro všechny obrazovky stejné, ať se při přepínání nic neposouvá.
 */
export function PageShell({
  width = 'default',
  className,
  children,
}: {
  width?: keyof typeof WIDTH
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn('mx-auto flex flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8', WIDTH[width], className)}>
      {children}
    </div>
  )
}

/**
 * Hlavička obrazovky: nadpis s akcentem, volitelný podnadpis (monospace),
 * vpravo jedna hlavní akce. `help` je místo pro malé „?“ s Návody (RD14).
 */
export function PageHeader({
  title,
  accent,
  subtitle,
  action,
  help,
  className,
}: {
  title: string
  /** Druhá půlka nadpisu v serifové kurzívě, max. jednou na obrazovce. */
  accent?: string
  subtitle?: React.ReactNode
  /** Jedna hlavní akce obrazovky (tlačítko nebo odkaz). */
  action?: React.ReactNode
  help?: React.ReactNode
  className?: string
}) {
  return (
    <header className={cn('flex flex-wrap items-end justify-between gap-x-4 gap-y-3', className)}>
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex items-center gap-3">
          <AccentHeading accent={accent}>{title}</AccentHeading>
          {help}
        </div>
        {subtitle && <p className="font-num text-sm text-quiet">{subtitle}</p>}
      </div>
      {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
    </header>
  )
}
