import { cn } from '@/lib/ws/utils'

/** Tečka „právě dorazilo" s rozbíhajícím se kruhem. Jen pro novou poptávku a živé upozornění. */
export function LiveDot({ label = 'Právě dorazilo', className }: { label?: string; className?: string }) {
  return (
    <span className={cn('inline-flex h-2 w-2 shrink-0 rounded-full bg-signal animate-zq-dot', className)} role="img" aria-label={label} />
  )
}
