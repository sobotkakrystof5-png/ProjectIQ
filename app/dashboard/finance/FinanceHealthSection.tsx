'use client'

import { Activity, TrendingUp, TrendingDown, Wallet, Percent } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { toneVariant, type AdminTone } from '@/lib/admin-status'
import type { FinanceHealthOverview } from './finance-actions'

const MONTHS_SHORT = ['Led', 'Úno', 'Bře', 'Dub', 'Kvě', 'Čer', 'Čec', 'Srp', 'Zář', 'Říj', 'Lis', 'Pro']

function formatAmount(amount: number) {
  return new Intl.NumberFormat('cs-CZ', {
    style: 'currency',
    currency: 'CZK',
    maximumFractionDigits: 0,
  }).format(amount)
}

const HEALTH_LABEL: Record<string, string> = {
  good: 'Skvělé',
  warning: 'Pozor na výdaje',
  bad: 'Ve ztrátě',
}

/**
 * Jak si stojíš: tři stavy přes pět tónů adminu (R-091). „V plusu" je
 * uzavřený stav (success), „Pozor na výdaje" čeká na vás (signal),
 * „Ve ztrátě" je chyba (danger).
 */
const HEALTH_TONE: Record<string, AdminTone> = { good: 'success', warning: 'signal', bad: 'danger' }

/**
 * Plocha dlaždice. Dílky mají jednu paletu, takže čtyři odstíny pro čtyři
 * dlaždice nemají co rozlišovat — příjem je plný, výdaj obrysem, jako
 * v penězích Workspace.
 */
const BG: Record<string, string> = {
  emerald: 'bg-navy-50',
  red: 'border border-navy-100',
  blue: 'bg-navy-50',
  purple: 'border border-navy-100',
}

function SummaryCard({
  icon, label, value, color,
}: {
  icon: React.ReactNode
  label: string
  value: string
  color: string
}) {
  return (
    <div className={`${BG[color]} rounded-chip p-3`}>
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <span className="text-xs text-quiet">{label}</span>
      </div>
      <p className="text-base font-semibold text-ink tabular-nums">{value}</p>
    </div>
  )
}

function RatioBar({ income, expense }: { income: number; expense: number }) {
  const total = income + expense
  const incomePct = total > 0 ? (income / total) * 100 : 50

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-quiet">
        <span>Příjmy : Výdaje (12 měsíců)</span>
        <span className="tabular-nums">{Math.round(incomePct)} % : {Math.round(100 - incomePct)} %</span>
      </div>
      <div className="h-2.5 w-full rounded-full overflow-hidden flex bg-muted">
        <div className="h-full bg-navy-600 transition-all duration-500" style={{ width: `${incomePct}%` }} />
        <div className="h-full bg-navy-200 transition-all duration-500" style={{ width: `${100 - incomePct}%` }} />
      </div>
    </div>
  )
}

function BarChart({ data }: { data: FinanceHealthOverview['trend'] }) {
  const maxVal = Math.max(...data.flatMap(d => [d.income, d.expense]), 1)

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-4 mb-1">
        <span className="text-xs font-medium text-ink">Posledních 6 měsíců</span>
        <div className="flex items-center gap-3 ml-auto">
          <span className="flex items-center gap-1 text-[10px] text-quiet">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-navy-600" />
            Příjmy
          </span>
          <span className="flex items-center gap-1 text-[10px] text-quiet">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-navy-200" />
            Výdaje
          </span>
        </div>
      </div>
      <div className="flex items-end gap-2 h-32">
        {data.map(m => {
          const [, mon] = m.month.split('-')
          const label = MONTHS_SHORT[parseInt(mon) - 1]
          const incomeH = Math.max((m.income / maxVal) * 100, m.income > 0 ? 3 : 0)
          const expenseH = Math.max((m.expense / maxVal) * 100, m.expense > 0 ? 3 : 0)

          return (
            <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full flex items-end justify-center gap-0.5" style={{ height: '96px' }}>
                <div
                  className="flex-1 rounded-t bg-navy-600 transition-all duration-500"
                  style={{ height: `${incomeH}%` }}
                  title={`Příjmy: ${formatAmount(m.income)}`}
                />
                <div
                  className="flex-1 rounded-t bg-navy-200 transition-all duration-500"
                  style={{ height: `${expenseH}%` }}
                  title={`Výdaje: ${formatAmount(m.expense)}`}
                />
              </div>
              <span className="text-[10px] text-quiet leading-none">{label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface Props {
  overview: FinanceHealthOverview
}

export function FinanceHealthSection({ overview }: Props) {
  const { income12m, expense12m, savings12m, savingsRate, health, trend } = overview

  return (
    <div className="bg-surface border border-navy-100 rounded-box p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Activity size={16} strokeWidth={1.5} className="text-navy-500" />
          <h2 className="text-base font-semibold text-ink">Jak si stojíš</h2>
        </div>
        {/* Odznak sám nese tón, tečka navíc by na tmavé pilulce zanikla. */}
        <Badge variant={toneVariant(HEALTH_TONE[health] ?? 'neutral')}>{HEALTH_LABEL[health]}</Badge>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard
          icon={<TrendingUp size={14} strokeWidth={1.5} className="text-navy-600" />}
          label="Příjmy (12 měs.)"
          value={formatAmount(income12m)}
          color="emerald"
        />
        <SummaryCard
          icon={<TrendingDown size={14} strokeWidth={1.5} className="text-quiet" />}
          label="Výdaje (12 měs.)"
          value={formatAmount(expense12m)}
          color="red"
        />
        <SummaryCard
          icon={<Wallet size={14} strokeWidth={1.5} className={savings12m >= 0 ? 'text-navy-600' : 'text-danger'} />}
          label="Úspory (12 měs.)"
          value={formatAmount(savings12m)}
          color={savings12m >= 0 ? 'blue' : 'red'}
        />
        <SummaryCard
          icon={<Percent size={14} strokeWidth={1.5} className="text-navy-600" />}
          label="Savings rate"
          value={`${Math.round(savingsRate)} %`}
          color="purple"
        />
      </div>

      <RatioBar income={income12m} expense={expense12m} />

      <BarChart data={trend} />
    </div>
  )
}
