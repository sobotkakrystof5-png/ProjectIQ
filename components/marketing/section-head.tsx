import { AccentHeading, SectionLabel } from '@/components/ws/brand'
import { cn } from '@/lib/ws/utils'

/** Nadpis sekce: H2 s kurzívou a štítek „01 — …" na stejném účaří (LP-D). */
export function SectionHead({
  id,
  number,
  label,
  title,
  accent,
  onDark = false,
  className,
}: {
  id: string
  number: string
  label: string
  title: React.ReactNode
  accent: string
  onDark?: boolean
  className?: string
}) {
  return (
    <div className={cn('flex flex-col-reverse gap-4 md:flex-row md:items-end md:justify-between md:gap-10', className)}>
      <AccentHeading id={id} as="h2" size="section" accent={accent} onDark={onDark} className="max-w-[760px]">
        {title}
      </AccentHeading>
      <SectionLabel number={number} onDark={onDark} className="shrink-0 md:pb-3">
        {label}
      </SectionLabel>
    </div>
  )
}
