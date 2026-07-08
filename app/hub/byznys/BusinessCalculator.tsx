'use client'

import { useMemo, useState } from 'react'
import {
  Calculator, TrendingUp, TrendingDown, Scale, Percent,
  AlertCircle, CheckCircle2, BadgeCheck,
} from 'lucide-react'
import type { BusinessOverview } from './byznys-actions'

function fmt(n: number) {
  return new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 0 }).format(n)
}

const STAT_BG: Record<'green' | 'red' | 'blue' | 'purple', string> = {
  green: 'bg-emerald-50',
  red: 'bg-red-50',
  blue: 'bg-blue-50',
  purple: 'bg-purple-50',
}

const STAT_TEXT: Record<'green' | 'red' | 'blue' | 'purple', string> = {
  green: 'text-emerald-700',
  red: 'text-red-600',
  blue: 'text-blue-700',
  purple: 'text-purple-700',
}

function StatCard({
  icon, label, value, sub, accent,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
  accent: 'green' | 'red' | 'blue' | 'purple'
}) {
  return (
    <div className={`${STAT_BG[accent]} rounded-xl p-4`}>
      <div className="flex items-center gap-1.5 mb-1.5">
        {icon}
        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className={`text-2xl font-bold leading-none ${STAT_TEXT[accent]}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1.5">{sub}</p>}
    </div>
  )
}

interface Props {
  overview: BusinessOverview
}

export function BusinessCalculator({ overview }: Props) {
  const { income, expenses, profit, marginPct, annualFixedCosts } = overview

  const [extraAmount, setExtraAmount] = useState('')
  const [extraType, setExtraType] = useState<'onetime' | 'monthly'>('monthly')

  const whatIf = useMemo(() => {
    const extraNum = parseFloat(extraAmount.replace(',', '.')) || 0
    const extraAnnual = extraType === 'monthly' ? extraNum * 12 : extraNum

    const newIncome = income + extraAnnual
    const newProfit = profit + extraAnnual
    const newMarginPct = newIncome > 0 ? (newProfit / newIncome) * 100 : 0

    const coveragePct = annualFixedCosts > 0 ? Math.min(999, (newIncome / annualFixedCosts) * 100) : 100
    const missingAnnual = Math.max(0, annualFixedCosts - newIncome)
    const missingMonthly = missingAnnual / 12

    return { extraAnnual, newIncome, newProfit, newMarginPct, coveragePct, missingMonthly }
  }, [extraAmount, extraType, income, profit, annualFixedCosts])

  return (
    <div className="bg-white border border-border rounded-2xl p-6 space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-brand-50 rounded-lg flex items-center justify-center">
            <Calculator size={15} className="text-brand-600" strokeWidth={1.5} />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">Výkonnost podnikání</h2>
            <p className="text-xs text-muted-foreground">Zakázky + byznys příjmy z Hubu vs. reálné náklady</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
          <BadgeCheck size={12} strokeWidth={1.5} />
          Reálná data
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          icon={<TrendingUp size={14} strokeWidth={1.5} className="text-blue-600" />}
          label="Příjmy"
          value={`${fmt(income)} Kč`}
          accent="blue"
        />
        <StatCard
          icon={<TrendingDown size={14} strokeWidth={1.5} className="text-red-500" />}
          label="Výdaje"
          value={`${fmt(expenses)} Kč`}
          accent="red"
        />
        <StatCard
          icon={<Scale size={14} strokeWidth={1.5} className={profit >= 0 ? 'text-emerald-600' : 'text-red-500'} />}
          label="Zisk / Ztráta"
          value={`${profit >= 0 ? '+' : ''}${fmt(profit)} Kč`}
          sub={profit < 0 ? 'Ve ztrátě' : undefined}
          accent={profit >= 0 ? 'green' : 'red'}
        />
        <StatCard
          icon={<Percent size={14} strokeWidth={1.5} className="text-purple-600" />}
          label="Marže"
          value={`${marginPct.toFixed(1)} %`}
          accent={marginPct >= 0 ? 'purple' : 'red'}
        />
      </div>

      {/* Co kdyby simulace */}
      <div className="bg-muted/30 border border-border rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <TrendingUp size={14} strokeWidth={1.5} className="text-brand-600" />
          <h3 className="text-sm font-semibold text-foreground">Co kdybych vydělal navíc...</h3>
        </div>

        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-xs font-medium text-muted-foreground block mb-1">Dodatečný příjem (Kč)</label>
            <input
              type="number"
              min="0"
              step="100"
              value={extraAmount}
              onChange={e => setExtraAmount(e.target.value)}
              placeholder="0"
              className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
            />
          </div>
          <div className="flex gap-1.5 items-end">
            {(['monthly', 'onetime'] as const).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setExtraType(t)}
                className={`h-[38px] px-3 text-xs font-medium rounded-lg border transition-colors ${
                  extraType === t
                    ? 'bg-brand-700 text-white border-brand-700'
                    : 'bg-white text-muted-foreground border-border hover:border-foreground/20'
                }`}
              >
                {t === 'monthly' ? 'Měsíčně' : 'Jednorázově'}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white border border-border rounded-lg p-3">
            <p className="text-xs text-muted-foreground mb-1">Nový zisk / ztráta</p>
            <p className={`text-lg font-bold ${whatIf.newProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
              {fmt(whatIf.newProfit)} Kč
            </p>
          </div>
          <div className="bg-white border border-border rounded-lg p-3">
            <p className="text-xs text-muted-foreground mb-1">Nová marže</p>
            <p className="text-lg font-bold text-foreground">{whatIf.newMarginPct.toFixed(1)} %</p>
          </div>
        </div>

        {annualFixedCosts > 0 && (
          <div className={`flex items-start gap-2 text-xs rounded-lg px-3 py-2 ${
            whatIf.missingMonthly > 0
              ? 'text-amber-700 bg-amber-50 border border-amber-200'
              : 'text-emerald-700 bg-emerald-50 border border-emerald-200'
          }`}
          >
            {whatIf.missingMonthly > 0
              ? <AlertCircle size={13} className="shrink-0 mt-0.5" strokeWidth={1.5} />
              : <CheckCircle2 size={13} className="shrink-0 mt-0.5" strokeWidth={1.5} />
            }
            <span>
              Běžíš na {Math.round(whatIf.coveragePct)} % pokrytí ročních fixních nákladů (opakující se náklady × 12, bez osobních)
              {whatIf.missingMonthly > 0
                ? ` — chybí ti ještě ${fmt(whatIf.missingMonthly)} Kč/měsíc.`
                : ' — fixní náklady máš plně pokryté.'}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
