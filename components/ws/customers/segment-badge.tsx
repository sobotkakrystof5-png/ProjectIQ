import { SEGMENT_LABELS, type SegmentKey } from '@/lib/ws/segment-labels'
import { cn } from '@/lib/ws/utils'

// Štítek skupiny zákazníka. Skupiny se liší i světlostí, ne jen odstínem
// (design Dílky): aktivní zákazníci tmavší, spící a ukončení tlumeně.
const TONE: Record<SegmentKey, string> = {
  new: 'bg-navy-700 text-white dark:bg-navy-600',
  regular: 'bg-navy-100 text-navy-900 dark:bg-navy-800 dark:text-navy-50',
  one_time: 'bg-navy-50 text-navy-700 dark:bg-navy-900 dark:text-navy-200',
  dormant: 'border border-dashed border-navy-300 text-navy-700 dark:border-navy-600 dark:text-navy-200',
  ended: 'bg-ground text-quiet dark:bg-navy-950',
}

export function SegmentBadge({ segment, className }: { segment: SegmentKey | null; className?: string }) {
  if (!segment) {
    return <span className={cn('font-num text-[11px] uppercase tracking-[0.08em] text-quiet', className)}>Bez návštěvy</span>
  }
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 font-num text-[11px] uppercase tracking-[0.08em]',
        TONE[segment],
        className,
      )}
    >
      {SEGMENT_LABELS[segment]}
    </span>
  )
}
