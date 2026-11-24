import { formatPercent, type BillingOverview } from '@/lib/admin/invoice-kinds'

/**
 * Pruh ceny zakázky (R-143): zaplaceno, vyfakturováno a čeká na platbu,
 * tahle faktura a co zbývá vyfakturovat. Bez stavu — kreslí se stejně
 * ve formuláři faktury i na detailu zakázky.
 */

function czk(amount: number): string {
  const whole = Math.round(amount * 100) % 100 === 0
  return new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK', minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 }).format(amount)
}

function Legend({ swatch, label, amount, price }: { swatch: string; label: string; amount: number; price: number }) {
  const pct = price > 0 ? Math.round((amount / price) * 10000) / 100 : 0
  return (
    <div className="flex min-w-0 items-start gap-2">
      <span className={`mt-1.5 h-2.5 w-2.5 flex-none rounded-full ${swatch}`} aria-hidden="true" />
      <div className="min-w-0">
        <dt className="text-xs text-quiet">
          {label} · <span className="whitespace-nowrap">{formatPercent(pct)} %</span>
        </dt>
        <dd className="whitespace-nowrap font-num text-sm tabular-nums text-ink">{czk(amount)}</dd>
      </div>
    </div>
  )
}

export function BillingBar({ overview, thisAmount = 0 }: { overview: BillingOverview; thisAmount?: number }) {
  const { price, paid, open, free } = overview
  const share = Math.min(Math.max(0, thisAmount), free)
  const rest = Math.max(0, Math.round((free - share) * 100) / 100)
  const width = (part: number) => `${price > 0 ? Math.max(0, Math.min(100, (part / price) * 100)) : 0}%`
  const summary =
    `Zaplaceno ${formatPercent(overview.paidPct)} %, čeká na zaplacení ${formatPercent(overview.openPct)} %` +
    (share > 0 ? `, tato faktura ${czk(share)}` : '') +
    `, zbývá vyfakturovat ${czk(rest)}.`

  return (
    <div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-navy-100" role="img" aria-label={summary}>
        <span className="h-full bg-navy-950" style={{ width: width(paid) }} />
        <span className="h-full bg-navy-500" style={{ width: width(open) }} />
        {share > 0 && <span className="h-full bg-navy-300" style={{ width: width(share) }} />}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 lg:grid-cols-4">
        <Legend swatch="bg-navy-950" label="Zaplaceno" amount={paid} price={price} />
        <Legend swatch="bg-navy-500" label="Čeká na zaplacení" amount={open} price={price} />
        {share > 0 && <Legend swatch="bg-navy-300" label="Tato faktura" amount={share} price={price} />}
        <Legend swatch="bg-navy-100" label="Zbývá vyfakturovat" amount={rest} price={price} />
      </dl>
    </div>
  )
}
