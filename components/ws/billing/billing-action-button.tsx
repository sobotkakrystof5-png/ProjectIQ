'use client'

import { useState, useTransition } from 'react'
import { Button, type ButtonProps } from '@/components/ui/button'
import { openBillingPortal, startCheckout } from '@/app/w/ucet/actions'

type Action = { kind: 'portal' } | { kind: 'checkout'; from: 'novy' | 'ucet' }

/**
 * Tlačítko, které odvede na Stripe (Checkout nebo Customer Portal). Adresu
 * vytvoří server action a přesměruje; když se to nepovede, ukáže hlášku.
 */
export function BillingActionButton({
  action,
  children,
  pendingLabel = 'Otevírám…',
  ...props
}: { action: Action; pendingLabel?: string } & Omit<ButtonProps, 'onClick'>) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function run() {
    setError(null)
    startTransition(async () => {
      const result = action.kind === 'portal' ? await openBillingPortal() : await startCheckout(action.from)
      if (result && !result.ok) setError(result.error)
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <Button {...props} disabled={pending || props.disabled} onClick={run}>
        {pending ? pendingLabel : children}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
