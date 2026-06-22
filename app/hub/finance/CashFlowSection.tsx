'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  PiggyBank, Plus, ChevronLeft, ChevronRight,
  TrendingUp, TrendingDown, Wallet, Percent,
  Trash2, AlertCircle, Loader2,
} from 'lucide-react'
import {
  createTransaction, deleteTransaction,
  type FinanceTransaction, type MonthlyAggregate, type TransactionType,
} from './finance-actions'
import { INCOME_CATEGORIES, EXPENSE_CATEGORIES } from './finance-constants'

const MONTHS_FULL = [
  'Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen',
  'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec',
]
const MONTHS_SHORT = ['Led', 'Úno', 'Bře', 'Dub', 'Kvě', 'Čer', 'Čec', 'Srp', 'Zář', 'Říj', 'Lis', 'Pro']

function formatMonth(month: string) {
  const [year, mon] = month.split('-')
  return `${MONTHS_FULL[parseInt(mon) - 1]} ${year}`
}

function formatAmount(amount: number) {
  return new Intl.NumberFormat('cs-CZ', {
    style: 'currency',
    currency: 'CZK',
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatDate(dateStr: string) {
  const [year, mon, day] = dateStr.split('-').map(Number)
  return new Date(year, mon - 1, day).toLocaleDateString('cs-CZ', {
    day: 'numeric',
    month: 'short',
  })
}

// --- Grouped bar chart (pure CSS) ---
function BarChart({ data }: { data: MonthlyAggregate[] }) {
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

// --- Summary card ---
const BG: Record<string, string> = {
  emerald: 'bg-emerald-50',
  red: 'bg-red-50',
  blue: 'bg-blue-50',
  orange: 'bg-orange-50',
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

// --- Main section ---
interface Props {
  transactions: FinanceTransaction[]
  monthlyAggregates: MonthlyAggregate[]
  currentMonth: string
}

export function CashFlowSection({ transactions, monthlyAggregates, currentMonth }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [showForm, setShowForm] = useState(false)
  const [type, setType] = useState<TransactionType>('income')
  const [category, setCategory] = useState<string>(INCOME_CATEGORIES[0])
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const income = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const expense = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const savings = income - expense
  const savingsRate = income > 0 ? Math.round((savings / income) * 100) : 0

  function navigateMonth(dir: 'prev' | 'next') {
    const [y, m] = currentMonth.split('-').map(Number)
    const d = new Date(y, m - 1 + (dir === 'next' ? 1 : -1), 1)
    const newMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    router.push(`/hub/finance?month=${newMonth}`)
  }

  function handleTypeChange(t: TransactionType) {
    setType(t)
    setCategory(t === 'income' ? INCOME_CATEGORIES[0] : EXPENSE_CATEGORIES[0])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    setIsSubmitting(true)

    const amountNum = parseFloat(amount.replace(',', '.'))
    if (isNaN(amountNum) || amountNum <= 0) {
      setFormError('Zadej platnou částku')
      setIsSubmitting(false)
      return
    }

    const result = await createTransaction({ amount: amountNum, type, category, note, date })
    setIsSubmitting(false)

    if (result.error) {
      setFormError(result.error)
      return
    }

    setAmount('')
    setNote('')
    setDate(new Date().toISOString().slice(0, 10))
    setShowForm(false)
    startTransition(() => { router.refresh() })
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      await deleteTransaction(id)
      router.refresh()
    })
  }

  const categories = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES

  return (
    <div className="bg-white border border-border rounded-2xl p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PiggyBank size={16} strokeWidth={1.5} className="text-emerald-600" />
          <h2 className="text-base font-semibold text-foreground">Cash Flow</h2>
        </div>
        <button
          onClick={() => setShowForm(f => !f)}
          className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg px-3 py-1.5 transition-colors"
        >
          <Plus size={13} strokeWidth={2} />
          Přidat transakci
        </button>
      </div>

      {/* Month picker */}
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={() => navigateMonth('prev')}
          className="p-1.5 hover:bg-muted rounded-lg transition-colors"
        >
          <ChevronLeft size={16} strokeWidth={1.5} className="text-muted-foreground" />
        </button>
        <span className="text-sm font-semibold text-foreground w-36 text-center">
          {formatMonth(currentMonth)}
        </span>
        <button
          onClick={() => navigateMonth('next')}
          className="p-1.5 hover:bg-muted rounded-lg transition-colors"
        >
          <ChevronRight size={16} strokeWidth={1.5} className="text-muted-foreground" />
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard
          icon={<TrendingUp size={14} strokeWidth={1.5} className="text-emerald-600" />}
          label="Příjmy"
          value={formatAmount(income)}
          color="emerald"
        />
        <SummaryCard
          icon={<TrendingDown size={14} strokeWidth={1.5} className="text-red-500" />}
          label="Výdaje"
          value={formatAmount(expense)}
          color="red"
        />
        <SummaryCard
          icon={
            <Wallet size={14} strokeWidth={1.5} className={savings >= 0 ? 'text-blue-600' : 'text-orange-500'} />
          }
          label="Úspory"
          value={formatAmount(savings)}
          color={savings >= 0 ? 'blue' : 'orange'}
        />
        <SummaryCard
          icon={<Percent size={14} strokeWidth={1.5} className="text-purple-600" />}
          label="Savings rate"
          value={`${savingsRate} %`}
          color="purple"
        />
      </div>

      {/* Bar chart */}
      <BarChart data={monthlyAggregates} />

      {/* Add form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="bg-muted/30 border border-border rounded-xl p-4 space-y-3"
        >
          {/* Type toggle */}
          <div className="flex gap-2">
            {(['income', 'expense'] as const).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => handleTypeChange(t)}
                className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${
                  type === t
                    ? t === 'income'
                      ? 'bg-emerald-500 text-white border-emerald-500'
                      : 'bg-red-500 text-white border-red-500'
                    : 'bg-white text-muted-foreground border-border hover:border-foreground/20'
                }`}
              >
                {t === 'income' ? 'Příjem' : 'Výdaj'}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Kategorie</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              >
                {categories.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Částka (Kč)</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0"
                required
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Datum</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                required
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Poznámka</label>
              <input
                type="text"
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Volitelně..."
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
            </div>
          </div>

          {formError && (
            <div className="flex items-center gap-2 text-red-600 text-xs">
              <AlertCircle size={12} strokeWidth={2} />
              {formError}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => { setShowForm(false); setFormError(null) }}
              className="flex-1 py-2 text-sm text-muted-foreground border border-border rounded-lg hover:bg-muted transition-colors"
            >
              Zrušit
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {isSubmitting && <Loader2 size={14} className="animate-spin" />}
              Uložit
            </button>
          </div>
        </form>
      )}

      {/* Transaction list */}
      <div className="space-y-0.5">
        {transactions.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Žádné transakce v {formatMonth(currentMonth)}.
          </p>
        ) : (
          transactions.map(t => (
            <div
              key={t.id}
              className="flex items-center gap-3 py-2.5 px-3 hover:bg-muted/40 rounded-lg group transition-colors"
            >
              <div
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${t.type === 'income' ? 'bg-emerald-400' : 'bg-red-400'}`}
              />
              <div className="min-w-0 flex-1">
                <span className="text-sm font-medium text-foreground">{t.category}</span>
                {t.note && (
                  <span className="text-xs text-muted-foreground ml-2 truncate">{t.note}</span>
                )}
              </div>
              <span className="text-xs text-muted-foreground shrink-0">{formatDate(t.date)}</span>
              <span
                className={`text-sm font-semibold shrink-0 tabular-nums ${t.type === 'income' ? 'text-emerald-600' : 'text-red-500'}`}
              >
                {t.type === 'income' ? '+' : '−'}{formatAmount(t.amount)}
              </span>
              <button
                onClick={() => handleDelete(t.id)}
                disabled={isPending}
                className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-red-500 transition-all disabled:opacity-30 shrink-0"
              >
                <Trash2 size={13} strokeWidth={1.5} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
