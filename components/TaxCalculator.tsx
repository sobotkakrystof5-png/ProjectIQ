'use client'

import { useMemo, useState } from 'react'
import { Calculator, RotateCcw, AlertTriangle, Info } from 'lucide-react'
import { calculateTax } from '@/lib/tax'
import { TAX_BASIS_NOTE, TAX_YEAR } from '@/lib/tax-constants'
import TaxLimitWatch from './TaxLimitWatch'

function fmt(n: number) {
  return n.toLocaleString('cs-CZ', { maximumFractionDigits: 0 })
}

function Row({
  label,
  value,
  hint,
  strong,
  accent,
}: {
  label: string
  value: string
  hint?: string
  strong?: boolean
  accent?: 'green' | 'red' | 'amber'
}) {
  const color =
    accent === 'green'
      ? 'text-emerald-700'
      : accent === 'red'
        ? 'text-red-600'
        : accent === 'amber'
          ? 'text-amber-700'
          : 'text-foreground'

  return (
    <div className="flex items-baseline justify-between gap-3 px-4 py-2.5">
      <div className="min-w-0">
        <p className={`text-sm ${strong ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
          {label}
        </p>
        {hint && <p className="text-xs text-muted-foreground/80 mt-0.5 leading-snug">{hint}</p>}
      </div>
      <p className={`text-sm tabular-nums whitespace-nowrap ${strong ? 'font-bold' : 'font-medium'} ${color}`}>
        {value}
      </p>
    </div>
  )
}

/**
 * Daňová kalkulačka nad přiznanou linií příjmů.
 *
 * `defaultIncome` chodí z ledgeru (součet přiznaných příjmů za rok podle
 * data zaplacení). Jde přepsat — na „co kdyby" se ptá člověk pořád, a
 * ledger kvůli tomu nemá cenu měnit.
 */
export default function TaxCalculator({
  defaultIncome,
  year = TAX_YEAR,
}: {
  defaultIncome: number
  year?: number
}) {
  const [raw, setRaw] = useState<string>(String(Math.max(0, Math.round(defaultIncome))))

  const income = Math.max(0, Number(raw.replace(/\s/g, '')) || 0)
  const edited = income !== Math.max(0, Math.round(defaultIncome))

  const r = useMemo(() => calculateTax({ income, year }), [income, year])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-brand-50 rounded-lg flex items-center justify-center">
            <Calculator size={15} className="text-brand-600" strokeWidth={1.5} />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">Daně a odvody</h3>
            <p className="text-xs text-muted-foreground">
              Rok {year} · vedlejší činnost (student) · 60% paušál · neplátce DPH
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="tax-income" className="text-xs text-muted-foreground whitespace-nowrap">
            Přiznaný příjem
          </label>
          <div className="relative">
            <input
              id="tax-income"
              type="number"
              min="0"
              step="1000"
              inputMode="numeric"
              value={raw}
              onChange={e => setRaw(e.target.value)}
              className="w-36 text-sm border border-border rounded-md px-2 py-1.5 pr-8 text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
              Kč
            </span>
          </div>
          {edited && (
            <button
              type="button"
              onClick={() => setRaw(String(Math.max(0, Math.round(defaultIncome))))}
              title="Vrátit částku z ledgeru"
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <RotateCcw size={14} strokeWidth={1.5} />
            </button>
          )}
        </div>
      </div>

      {edited && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Počítáš s ručně zadanou částkou, ne s příjmem z ledgeru ({fmt(Math.round(defaultIncome))} Kč).
        </p>
      )}

      {r.overLumpSumCap && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-2">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" strokeWidth={1.5} />
          <span>
            Příjem přesáhl 2 000 000 Kč — 60% paušál už nelze uplatnit a vzniká povinná registrace
            k DPH. Čísla níže jsou jen orientační, výdaje bude potřeba uplatnit skutečné.
          </span>
        </p>
      )}

      {!r.ratesMatchYear && (
        <p className="text-xs text-muted-foreground bg-slate-50 border border-border rounded-lg px-3 py-2 flex items-start gap-2">
          <Info size={14} className="shrink-0 mt-0.5" strokeWidth={1.5} />
          <span>
            Pro rok {year} nejsou v aplikaci vlastní sazby — počítá se sazbami roku {r.ratesYear}.
          </span>
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="bg-white border border-border rounded-xl p-4 shadow-sm">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1.5">
            Odvody celkem
          </p>
          <p className="text-2xl font-bold text-red-600 leading-none tabular-nums">
            {fmt(r.totalLevies)} Kč
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            efektivní zdanění {(r.effectiveRate * 100).toFixed(1).replace('.', ',')} %
          </p>
        </div>
        <div className="bg-white border border-border rounded-xl p-4 shadow-sm">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1.5">
            Zbyde ti
          </p>
          <p className="text-2xl font-bold text-emerald-700 leading-none tabular-nums">
            {fmt(r.net)} Kč
          </p>
          <p className="text-xs text-muted-foreground mt-1">příjem po odvodech</p>
        </div>
        <div className="bg-brand-50 border border-brand-100 rounded-xl p-4 shadow-sm">
          <p className="text-xs text-brand-700 font-medium uppercase tracking-wide mb-1.5">
            Měsíční rezerva
          </p>
          <p className="text-2xl font-bold text-brand-700 leading-none tabular-nums">
            {fmt(r.monthlyReserve)} Kč
          </p>
          <p className="text-xs text-brand-600/80 mt-1">abys na odvody měl odloženo</p>
        </div>
      </div>

      <div className="bg-white border border-border rounded-xl overflow-hidden divide-y divide-border">
        <Row
          label="Příjem"
          value={`${fmt(r.income)} Kč`}
          hint="Přiznané příjmy podle data zaplacení"
        />
        <Row
          label="Výdajový paušál 60 %"
          value={`− ${fmt(r.expenses)} Kč`}
          hint={r.overLumpSumCap ? 'Zastropováno na 1 200 000 Kč' : undefined}
        />
        <Row label="Daňový základ" value={`${fmt(r.taxBase)} Kč`} strong />
        <Row label="Daň před slevou" value={`${fmt(r.taxBeforeCredit)} Kč`} />
        <Row
          label="Sleva na poplatníka"
          value={`− ${fmt(r.creditUsed)} Kč`}
          hint={
            r.tax === 0 && r.taxBeforeCredit > 0
              ? 'Sleva pokryje celou daň — na dani neplatíš nic'
              : undefined
          }
          accent="green"
        />
        <Row label="Daň z příjmu" value={`${fmt(r.tax)} Kč`} strong accent={r.tax > 0 ? 'red' : 'green'} />
        <Row
          label="Sociální pojištění"
          value={`${fmt(r.social)} Kč`}
          hint={
            r.socialApplies
              ? 'Základ přesáhl rozhodnou částku — platí se z celého vyměřovacího základu'
              : 'Vedlejší činnost pod rozhodnou částkou — neplatí se'
          }
          accent={r.social > 0 ? 'red' : 'green'}
        />
        <Row
          label="Zdravotní pojištění"
          value={`${fmt(r.health)} Kč`}
          hint="Student — bez minimálního základu a bez záloh"
          accent={r.health > 0 ? 'red' : undefined}
        />
        <Row label="Odvody celkem" value={`${fmt(r.totalLevies)} Kč`} strong accent="red" />
        <Row label="Čistý zisk" value={`${fmt(r.net)} Kč`} strong accent="green" />
      </div>

      <TaxLimitWatch income={income} />

      <p className="text-xs text-muted-foreground leading-relaxed">{TAX_BASIS_NOTE}</p>
    </div>
  )
}
