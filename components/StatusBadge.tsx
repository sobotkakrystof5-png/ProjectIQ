import { Badge } from '@/components/ui/badge'
import { PROJECT_STATUS_TONE, toneVariant } from '@/lib/admin-status'
import { STATUS_LABELS, type ProjectStatus } from '@/lib/types'

/** Stav zakázky. Barvu vybírá jeden systém tónů (AD05), ne obrazovka. */
export function StatusBadge({ status, className }: { status: ProjectStatus; className?: string }) {
  return (
    <Badge variant={toneVariant(PROJECT_STATUS_TONE[status])} className={className}>
      {STATUS_LABELS[status]}
    </Badge>
  )
}
