import { cn } from '@/lib/ws/utils'

// Místo pro obsah, který se načítá. Pulz vypne prefers-reduced-motion (app/ws-tokens.css).
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden className={cn('animate-pulse rounded-chip bg-navy-50 dark:bg-navy-800', className)} {...props} />
}

export { Skeleton }
