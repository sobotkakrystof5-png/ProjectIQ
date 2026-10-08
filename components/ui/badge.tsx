import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/ws/utils'

// Štítek stavu — pilulka. Stavy se liší i světlostí, ne jen odstínem.
const badgeVariants = cva(
  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold',
  {
    variants: {
      variant: {
        neutral: 'bg-navy-50 text-quiet dark:bg-navy-800 dark:text-navy-200',
        confirmed: 'bg-navy-100 text-navy-900 dark:bg-navy-700 dark:text-white',
        strong: 'bg-navy-700 text-white',
        outline: 'border border-input text-quiet',
        // Jen nová poptávka / živé upozornění
        signal: 'border border-dashed border-signal-line bg-signal-bg text-signal-ink',
        danger: 'bg-danger/10 text-danger dark:bg-danger/25 dark:text-white',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
)

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
