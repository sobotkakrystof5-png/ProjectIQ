import { cn } from '@/lib/ws/utils'
import { formatMoney, type WsCurrency } from '@/lib/ws/money'

/** Částka v JetBrains Mono: „1 249 Kč". `minor` = částka v haléřích (jak je v DB). */
export function Money({
  amount,
  currency = 'CZK',
  minor = false,
  className,
}: {
  amount: number
  currency?: WsCurrency
  minor?: boolean
  className?: string
}) {
  return (
    <span data-ws-private-value className={cn('whitespace-nowrap font-num tabular-nums', className)}>
      {formatMoney(amount, { currency, minor })}
    </span>
  )
}
