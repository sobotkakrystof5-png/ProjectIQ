'use client'

import { AlertTriangle, CheckCircle2, Gauge } from 'lucide-react'
import { INCOME_THRESHOLDS } from '@/lib/tax-constants'
import { remainingToThreshold } from '@/lib/tax'

function fmt(n: number) {
  return n.toLocaleString('cs-CZ', { maximumFractionDigits: 0 })
}

/**
 * Hlídač limitů — tři hranice, po jejichž překročení se mění povinnosti.
 * Počítá se z přiznaného příjmu za rok; nepřiznaná linie do hranic
 * nevstupuje.
 */
export default function TaxLimitWatch({ income }: { income: number }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Gauge size={15} className="text-navy-600" strokeWidth={1.5} />
        <h4 className="text-sm font-semibold text-ink">Hlídač limitů</h4>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {INCOME_THRESHOLDS.map(t => {
          const remaining = remainingToThreshold(income, t.limit)
          const exceeded = income > t.limit
          const pct = Math.min(100, t.limit > 0 ? (Math.max(0, income) / t.limit) * 100 : 0)
          // Poslední desetina před hranicí — ještě se nic neděje, ale je čas
          // začít to sledovat.
          const near = !exceeded && pct >= 90

          return (
            <div
              key={t.key}
              className={`rounded-chip border p-4 ${
                exceeded
                  ? 'border-signal-line bg-signal-bg'
                  : near
                    ? 'border-signal-line/50 bg-surface'
                    : 'border-navy-100 bg-surface'
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-quiet">
                  {t.label}
                </p>
                {exceeded ? (
                  <AlertTriangle size={14} className="text-signal-ink shrink-0" strokeWidth={1.5} />
                ) : (
                  <CheckCircle2 size={14} className="text-navy-600 shrink-0" strokeWidth={1.5} />
                )}
              </div>

              <p className="text-lg font-bold text-ink tabular-nums leading-none">
                {fmt(t.limit)} Kč
              </p>

              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden my-2.5">
                <div
                  className={`h-full transition-all duration-500 ${
                    exceeded ? 'bg-signal-line' : near ? 'bg-signal' : 'bg-navy-600'
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>

              <p className={`text-xs font-medium ${exceeded ? 'text-signal-ink' : 'text-ink'}`}>
                {exceeded
                  ? `Překročeno o ${fmt(income - t.limit)} Kč`
                  : `Do hranice ti zbývá ${fmt(remaining)} Kč`}
              </p>
              <p className="text-xs text-quiet mt-1 leading-snug">{t.consequence}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
