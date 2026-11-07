import { AccentHeading } from '@/components/ws/brand'
import { cn } from '@/lib/ws/utils'

/** Nadpis sekce: jedna věta jedním písmem, bez štítku a čísla nad ním (R-078). */
export function SectionHead({
  id,
  title,
  onDark = false,
  className,
}: {
  id: string
  title: React.ReactNode
  onDark?: boolean
  className?: string
}) {
  return (
    <AccentHeading id={id} as="h2" size="section" onDark={onDark} className={cn('max-w-[760px]', className)}>
      {title}
    </AccentHeading>
  )
}
