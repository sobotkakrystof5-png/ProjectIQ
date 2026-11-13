import { cn } from '@/lib/utils'

/**
 * Pracovní panel adminu (AD17).
 *
 * Dřív si ho každá obrazovka psala sama jako `rounded-box border border-navy-100
 * bg-surface p-6 shadow-sm` — pokaždé o kousek jinak. Dílky mají pro plochu
 * v klidu **plochý** panel (DESIGN.md → Elevation & Depth: stín patří jen
 * tomu, co plave — menu, dialogu, věrnostní kartě), tichý okraj `navy-100`
 * a rádius 20 px.
 *
 * `CARD_CLASS` je tentýž panel jako třída — pro komponenty, které si plochu
 * kreslí samy a berou `className` (např. `MemoryCard`).
 */
export const CARD_CLASS = 'rounded-box border border-navy-100 bg-surface p-5 sm:p-6'

export function Card({
  id,
  className,
  children,
}: {
  id?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <section id={id} className={cn(CARD_CLASS, className)}>
      {children}
    </section>
  )
}

/**
 * Štítek sekce Dílků jako **třída**, ne komponenta: nadpis panelu má být `h2`
 * a popisek pole `label`, aby obrazovka dávala smysl čtečce. Komponenta
 * `SectionLabel` z `components/ws/brand` umí jen `p`, a rozšiřovat ji kvůli
 * adminu se neosvědčilo — v dev režimu se server a prohlížeč rozcházely
 * v hydrataci (AD17).
 */
export const SECTION_LABEL = 'font-num text-xs font-medium uppercase tracking-[0.12em] text-quiet'

/** Nadpis panelu: štítek Dílků a pod ním jedna věta, k čemu panel je. */
export function CardHead({
  title,
  hint,
  action,
  className,
}: {
  title: string
  hint?: React.ReactNode
  /** Jedna akce panelu vpravo (tlačítko, odkaz). */
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('mb-5 flex flex-wrap items-start justify-between gap-x-4 gap-y-2', className)}>
      <div className="min-w-0">
        <h2 className={SECTION_LABEL}>{title}</h2>
        {hint && <p className="mt-2 text-sm text-quiet">{hint}</p>}
      </div>
      {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
    </div>
  )
}
