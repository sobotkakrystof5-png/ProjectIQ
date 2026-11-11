'use client'

import { Activity, TrendingUp, TrendingDown, Wallet, Percent } from 'lucide-react'
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

const HEALTH_STYLE: Record<string, string> = {
  good: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  warning: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  bad: 'bg-red-50 text-red-600 ring-1 ring-red-200',
}

const HEALTH_DOT: Record<string, string> = {
  good: 'bg-emerald-500',
  warning: 'bg-amber-500',
  bad: 'bg-red-500',
}

const BG: Record<string, string> = {
  emerald: 'bg-emerald-50',
  red: 'bg-red-50',
  blue: 'bg-blue-50',
  purple: 'bg-purple-50',
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
    <div className={`${BG[color]} rounded-xl p-3`}>
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="text-base font-semibold text-foreground tabular-nums">{value}</p>
    </div>
  )
}

function RatioBar({ income, expense }: { income: number; expense: number }) {
  const total = income + expense
  const incomePct = total > 0 ? (income / total) * 100 : 50

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Příjmy : Výdaje (12 měsíců)</span>
        <span className="tabular-nums">{Math.round(incomePct)} % : {Math.round(100 - incomePct)} %</span>
      </div>
      <div className="h-2.5 w-full rounded-full overflow-hidden flex bg-muted">
        <div className="h-full bg-emerald-400 transition-all duration-500" style={{ width: `${incomePct}%` }} />
        <div className="h-full bg-red-400 transition-all duration-500" style={{ width: `${100 - incomePct}%` }} />
      </div>
    </div>
  )
}

function BarChart({ data }: { data: FinanceHealthOverview['trend'] }) {
  const maxVal = Math.max(...data.flatMap(d => [d.income, d.expense]), 1)

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-4 mb-1">
        <span className="text-xs font-medium text-foreground">Posledních 6 měsíců</span>
        <div className="flex items-center gap-3 ml-auto">
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-400 inline-block" />
            Příjmy
          </span>
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="w-2.5 h-2.5 rounded-sm bg-red-400 inline-block" />
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
                  className="flex-1 bg-emerald-400 rounded-t transition-all duration-500"
                  style={{ height: `${incomeH}%` }}
                  title={`Příjmy: ${formatAmount(m.income)}`}
                />
                <div
                  className="flex-1 bg-red-400 rounded-t transition-all duration-500"
                  style={{ height: `${expenseH}%` }}
                  title={`Výdaje: ${formatAmount(m.expense)}`}
                />
              </div>
              <span className="text-[10px] text-muted-foreground leading-none">{label}</span>
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
    <div className="bg-white border border-border rounded-2xl p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Activity size={16} strokeWidth={1.5} className="text-emerald-600" />
          <h2 className="text-base font-semibold text-foreground">Jak si stojíš</h2>
        </div>
        <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${HEALTH_STYLE[health]}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${HEALTH_DOT[health]}`} />
          {HEALTH_LABEL[health]}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard
          icon={<TrendingUp size={14} strokeWidth={1.5} className="text-emerald-600" />}
          label="Příjmy (12 měs.)"
          value={formatAmount(income12m)}
          color="emerald"
        />
        <SummaryCard
          icon={<TrendingDown size={14} strokeWidth={1.5} className="text-red-500" />}
          label="Výdaje (12 měs.)"
          value={formatAmount(expense12m)}
          color="red"
        />
        <SummaryCard
          icon={<Wallet size={14} strokeWidth={1.5} className={savings12m >= 0 ? 'text-blue-600' : 'text-red-500'} />}
          label="Úspory (12 měs.)"
          value={formatAmount(savings12m)}
          color={savings12m >= 0 ? 'blue' : 'red'}
        />
        <SummaryCard
          icon={<Percent size={14} strokeWidth={1.5} className="text-purple-600" />}
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
