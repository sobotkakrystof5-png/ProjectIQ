'use client'

import { useState, useMemo } from 'react'

interface Result {
  year: number
  balance: number
  invested: number
  gains: number
}

export function CompoundCalculator() {
  const [initial, setInitial] = useState(10000)
  const [monthly, setMonthly] = useState(3000)
  const [rate, setRate] = useState(7)
  const [years, setYears] = useState(20)

  const results = useMemo<Result[]>(() => {
    const r = rate / 100 / 12
    const rows: Result[] = []
    let balance = initial

    for (let y = 1; y <= years; y++) {
      for (let m = 0; m < 12; m++) {
        balance = balance * (1 + r) + monthly
      }
      const invested = initial + monthly * 12 * y
      rows.push({ year: y, balance, invested, gains: balance - invested })
    }
    return rows
  }, [initial, monthly, rate, years])

  const final = results[results.length - 1]
  const totalInvested = initial + monthly * 12 * years
  const totalGains = final ? final.balance - totalInvested : 0

  function formatCZK(n: number) {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)} M Kč`
    return new Intl.NumberFormat('cs-CZ', {
      style: 'currency',
      currency: 'CZK',
      maximumFractionDigits: 0,
    }).format(n)
  }

  const maxBalance = final?.balance ?? 1

  return (
    <div className="bg-surface border border-navy-100 rounded-box p-6 space-y-6">
      {/* Inputs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-quiet uppercase tracking-wide">
            Počáteční vklad
          </label>
          <div className="relative">
            <input
              type="number"
              value={initial}
              onChange={e => setInitial(Number(e.target.value))}
              className="w-full rounded-chip border border-input bg-surface px-3.5 py-2.5 text-[15px] text-ink transition-colors focus-visible:border-navy-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
              min={0}
              step={1000}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-quiet">Kč</span>
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-quiet uppercase tracking-wide">
            Měsíční vklad
          </label>
          <div className="relative">
            <input
              type="number"
              value={monthly}
              onChange={e => setMonthly(Number(e.target.value))}
              className="w-full rounded-chip border border-input bg-surface px-3.5 py-2.5 text-[15px] text-ink transition-colors focus-visible:border-navy-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
              min={0}
              step={500}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-quiet">Kč</span>
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-quiet uppercase tracking-wide">
            Roční výnos
          </label>
          <div className="relative">
            <input
              type="number"
              value={rate}
              onChange={e => setRate(Number(e.target.value))}
              className="w-full rounded-chip border border-input bg-surface px-3.5 py-2.5 text-[15px] text-ink transition-colors focus-visible:border-navy-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
              min={0}
              max={30}
              step={0.5}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-quiet">%</span>
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-quiet uppercase tracking-wide">
            Horizont
          </label>
          <div className="relative">
            <input
              type="number"
              value={years}
              onChange={e => setYears(Math.max(1, Math.min(50, Number(e.target.value))))}
              className="w-full rounded-chip border border-input bg-surface px-3.5 py-2.5 text-[15px] text-ink transition-colors focus-visible:border-navy-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
              min={1}
              max={50}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-quiet">let</span>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      {final && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-chip bg-navy-50 p-3 text-center">
            <p className="mb-1 text-xs font-medium text-quiet">Celková hodnota</p>
            <p className="font-num text-base font-bold text-ink">{formatCZK(final.balance)}</p>
          </div>
          <div className="rounded-chip border border-navy-100 p-3 text-center">
            <p className="mb-1 text-xs font-medium text-quiet">Vloženo celkem</p>
            <p className="font-num text-base font-bold text-ink">{formatCZK(totalInvested)}</p>
          </div>
          <div className="rounded-chip border border-navy-100 p-3 text-center">
            <p className="mb-1 text-xs font-medium text-quiet">Zisky</p>
            <p className="font-num text-base font-bold text-ink">{formatCZK(totalGains)}</p>
          </div>
        </div>
      )}

      {/* Bar chart */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-quiet uppercase tracking-wide">Vývoj hodnoty portfolia</p>
        <div className="flex items-end gap-1 h-28">
          {results
            .filter((_, i) => i % Math.ceil(years / 20) === 0 || i === results.length - 1)
            .map(row => {
              const heightPct = (row.balance / maxBalance) * 100
              const investedPct = (row.invested / maxBalance) * 100
              return (
                <div
                  key={row.year}
                  className="flex-1 flex flex-col justify-end gap-0 group relative"
                  title={`Rok ${row.year}: ${formatCZK(row.balance)}`}
                >
                  <div className="absolute -top-5 left-1/2 -translate-x-1/2 hidden group-hover:block text-[10px] text-quiet whitespace-nowrap bg-surface border border-navy-100 rounded px-1 py-0.5 shadow-sm z-10">
                    {row.year}r: {formatCZK(row.balance)}
                  </div>
                  <div
                    className="w-full rounded-t-sm bg-navy-300"
                    style={{ height: `${heightPct - investedPct}%` }}
                  />
                  <div
                    className="w-full bg-navy-700"
                    style={{ height: `${investedPct}%` }}
                  />
                </div>
              )
            })}
        </div>
        <div className="flex items-center gap-4 text-xs text-quiet">
          <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-navy-700" />Vloženo</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-navy-300" />Zisky</span>
        </div>
      </div>
    </div>
  )
}
