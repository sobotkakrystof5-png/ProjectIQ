import { TableSkeleton } from '@/components/admin/page-skeleton'

// Detail zakázky: hlavička, pruh záložek a karty pod ním.
export default function Loading() {
  return <TableSkeleton width="narrow" rows={4} />
}
