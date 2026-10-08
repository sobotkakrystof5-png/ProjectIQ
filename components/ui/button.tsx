import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/ws/utils'

// Tlačítko Dílků: pilulka, výška min. 44 px. Jedna hlavní akce (primary) na obrazovku.
const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold transition-colors duration-200 ease-zq focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-navy-700 text-white hover:bg-navy-800 active:bg-navy-900',
        outline: 'border border-input bg-surface text-ink hover:bg-accent',
        ghost: 'text-ink hover:bg-accent',
        danger: 'bg-danger text-white hover:bg-danger/90',
        // Hlavní tlačítko na tmavé ploše (hero, ceník landing page)
        inverse: 'bg-white text-navy-950 hover:bg-navy-50',
      },
      size: {
        md: 'h-11 px-5 text-[15px]',
        lg: 'h-12 px-7 text-base',
        icon: 'h-11 w-11',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, type, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        ref={ref}
        type={asChild ? undefined : (type ?? 'button')}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    )
  },
)
Button.displayName = 'Button'

export { Button, buttonVariants }
