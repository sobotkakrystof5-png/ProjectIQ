'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Wallet, Plus, ChevronLeft, ChevronRight,
  Trash2, AlertCircle, Loader2,
  RefreshCw, Tag, ExternalLink, ArrowUpCircle, ArrowDownCircle,
  TrendingUp, TrendingDown, Scale, ArrowUpRight, ArrowDownRight,
} from 'lucide-react'
import {
  createTransaction, deleteTransaction,
  createRecurringCashFlow, deleteRecurringCashFlow,
  type FinanceTransaction, type TransactionType,
  type RecurringCashFlow, type RecurringFrequency, type Cost, type MonthSummary,
} from './finance-actions'
import {
  INCOME_CATEGORIES, EXPENSE_CATEGORIES,
  LIFE_AREAS, AREA_LABELS, AREA_STYLES, type LifeArea,
} from './finance-constants'

const MONTHS_FULL = [
  'Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen',
  'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec',
]

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
  return new Date(year, mon - 1, day).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short' })
}

function AreaBadge({ area }: { area: string | null }) {
  if (!area) return null
  const style = AREA_STYLES[area as LifeArea] ?? 'bg-slate-50 text-slate-600 ring-1 ring-slate-200'
  const label = AREA_LABELS[area as LifeArea] ?? area
  return (
    <span className={`inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full ${style}`}>
      {label}
    </span>
  )
}

interface RecurringRow {
  id: string
  source: 'cashflow' | 'cost'
  label: string
  description: string | null
  area: string | null
  amount: number
}

function RecurringRowItem({
  row, onDelete, isPending,
}: {
  row: RecurringRow
  onDelete: (id: string) => void
  isPending: boolean
}) {
  return (
    <div className="flex items-center gap-2.5 py-2 px-2.5 bg-muted/20 hover:bg-muted/40 rounded-lg group transition-colors">
      <RefreshCw size={11} strokeWidth={1.5} className="text-muted-foreground shrink-0" />
      <div className="min-w-0 flex-1">
        <span className="text-sm font-medium text-foreground">{row.label}</span>
        {row.description && (
          <span className="text-xs text-muted-foreground ml-2 truncate">{row.description}</span>
        )}
      </div>
      {row.area && <AreaBadge area={row.area} />}
      {row.source === 'cost' ? (
        <Link
          href="/dashboard/naklady"
          className="hidden sm:flex items-center gap-1 text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full hover:text-foreground transition-colors shrink-0"
        >
          <ExternalLink size={9} strokeWidth={1.5} />
          Náklady zakázek
        </Link>
      ) : null}
      <span className="text-sm font-semibold text-foreground shrink-0 tabular-nums">
        {formatAmount(row.amount)}
      </span>
      {row.source === 'cashflow' ? (
        <button
          onClick={() => onDelete(row.id)}
          disabled={isPending}
          className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-red-500 transition-all disabled:opacity-30 shrink-0"
        >
          <Trash2 size={13} strokeWidth={1.5} />
        </button>
      ) : (
        <span className="w-[21px] shrink-0" />
      )}
    </div>
  )
}

function ColumnSection({
  oneTimeItems, monthlyItems, annualItems, onDeleteTransaction, onDeleteRecurring, isPending, currentMonth,
}: {
  oneTimeItems: FinanceTransaction[]
  monthlyItems: RecurringRow[]
  annualItems: RecurringRow[]
  onDeleteTransaction: (id: string) => void
  onDeleteRecurring: (id: string) => void
  isPending: boolean
  currentMonth: string
}) {
  return (
    <div className="space-y-4">
      {/* Jednorázové */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <Tag size={11} strokeWidth={1.5} className="text-muted-foreground" />
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
            Jednorázové · {formatMonth(currentMonth)}
          </span>
        </div>
        {oneTimeItems.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">Žádné položky tento měsíc</p>
        ) : (
          <div className="space-y-0.5">
            {oneTimeItems.map(t => (
              <div key={t.id} className="flex items-center gap-2.5 py-2 px-2.5 hover:bg-muted/40 rounded-lg group transition-colors">
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-medium text-foreground">{t.category}</span>
                  {t.note && <span className="text-xs text-muted-foreground ml-2 truncate">{t.note}</span>}
                </div>
                {t.area && <AreaBadge area={t.area} />}
                <span className="text-xs text-muted-foreground shrink-0">{formatDate(t.date)}</span>
                <span className="text-sm font-semibold text-foreground shrink-0 tabular-nums">{formatAmount(t.amount)}</span>
                <button
                  onClick={() => onDeleteTransaction(t.id)}
                  disabled={isPending}
                  className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-red-500 transition-all disabled:opacity-30 shrink-0"
                >
                  <Trash2 size={13} strokeWidth={1.5} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Měsíčně */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <RefreshCw size={11} strokeWidth={1.5} className="text-muted-foreground" />
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Měsíčně</span>
        </div>
        {monthlyItems.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">Žádné opakované položky</p>
        ) : (
          <div className="space-y-0.5">
            {monthlyItems.map(row => (
              <RecurringRowItem key={`${row.source}-${row.id}`} row={row} onDelete={onDeleteRecurring} isPending={isPending} />
            ))}
          </div>
        )}
      </div>

      {/* Ročně */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <RefreshCw size={11} strokeWidth={1.5} className="text-muted-foreground" />
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Ročně</span>
        </div>
        {annualItems.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">Žádné opakované položky</p>
        ) : (
          <div className="space-y-0.5">
            {annualItems.map(row => (
              <RecurringRowItem key={`${row.source}-${row.id}`} row={row} onDelete={onDeleteRecurring} isPending={isPending} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function MonthSummaryBar({ summary }: { summary: MonthSummary }) {
  const { income, expense, net, prevNet, prevMonth } = summary
  const netChange = net - prevNet
  const netChangePct = prevNet !== 0 ? (netChange / Math.abs(prevNet)) * 100 : null
  const savingsRate = income > 0 ? (net / income) * 100 : null

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div className="bg-emerald-50 rounded-xl p-3">
        <div className="flex items-center gap-1.5 mb-1">
          <TrendingUp size={14} strokeWidth={1.5} className="text-emerald-600" />
          <span className="text-xs text-muted-foreground">Příjmy celkem</span>
        </div>
        <p className="text-base font-semibold text-foreground tabular-nums">{formatAmount(income)}</p>
      </div>

      <div className="bg-red-50 rounded-xl p-3">
        <div className="flex items-center gap-1.5 mb-1">
          <TrendingDown size={14} strokeWidth={1.5} className="text-red-500" />
          <span className="text-xs text-muted-foreground">Výdaje celkem</span>
        </div>
        <p className="text-base font-semibold text-foreground tabular-nums">{formatAmount(expense)}</p>
      </div>

      <div className={`rounded-xl p-3 ${net >= 0 ? 'bg-blue-50' : 'bg-red-50'}`}>
        <div className="flex items-center gap-1.5 mb-1">
          <Scale size={14} strokeWidth={1.5} className={net >= 0 ? 'text-blue-600' : 'text-red-500'} />
          <span className="text-xs text-muted-foreground">Bilance</span>
        </div>
        <p className={`text-base font-semibold tabular-nums ${net >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
          {net >= 0 ? '+' : ''}{formatAmount(net)}
        </p>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Míra úspor: {savingsRate === null ? '—' : `${Math.round(savingsRate)} %`}
        </p>
      </div>

      <div className="bg-purple-50 rounded-xl p-3">
        <div className="flex items-center gap-1.5 mb-1">
          {netChange >= 0
            ? <ArrowUpRight size={14} strokeWidth={1.5} className="text-emerald-600" />
            : <ArrowDownRight size={14} strokeWidth={1.5} className="text-red-500" />}
          <span className="text-xs text-muted-foreground">Meziměsíční změna</span>
        </div>
        <p className={`text-base font-semibold tabular-nums ${netChange >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
          {netChange >= 0 ? '+' : ''}{formatAmount(netChange)}
          {netChangePct !== null && (
            <span className="text-xs font-medium ml-1">
              ({netChangePct >= 0 ? '+' : ''}{Math.round(netChangePct)} %)
            </span>
          )}
        </p>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          vs. {formatMonth(prevMonth)}: {prevNet >= 0 ? '+' : ''}{formatAmount(prevNet)}
        </p>
      </div>
    </div>
  )
}

interface Props {
  transactions: FinanceTransaction[]
  currentMonth: string
  recurringItems: RecurringCashFlow[]
  costs: Cost[]
  summary: MonthSummary
}

export function IncomeExpenseSection({ transactions, currentMonth, recurringItems, costs, summary }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [showForm, setShowForm] = useState(false)
  const [type, setType] = useState<TransactionType>('income')
  const [isPassive, setIsPassive] = useState(false)
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly')
  const [category, setCategory] = useState<string>(INCOME_CATEGORIES[0])
  const [area, setArea] = useState<string>('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [description, setDescription] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const incomeOneTime = transactions.filter(t => t.type === 'income')
  const expenseOneTime = transactions.filter(t => t.type === 'expense')
  const incomeOneTimeTotal = incomeOneTime.reduce((s, t) => s + t.amount, 0)
  const expenseOneTimeTotal = expenseOneTime.reduce((s, t) => s + t.amount, 0)

  const incomeMonthly: RecurringRow[] = recurringItems
    .filter(r => r.type === 'income' && r.frequency === 'monthly')
    .map(r => ({ id: r.id, source: 'cashflow', label: r.category, description: r.description, area: r.area, amount: r.amount }))
  const incomeAnnual: RecurringRow[] = recurringItems
    .filter(r => r.type === 'income' && r.frequency === 'annual')
    .map(r => ({ id: r.id, source: 'cashflow', label: r.category, description: r.description, area: r.area, amount: r.amount }))

  const expenseMonthly: RecurringRow[] = [
    ...recurringItems
      .filter(r => r.type === 'expense' && r.frequency === 'monthly')
      .map(r => ({ id: r.id, source: 'cashflow' as const, label: r.category, description: r.description, area: r.area, amount: r.amount })),
    ...costs
      .filter(c => c.cost_type === 'fixed_monthly')
      .map(c => ({ id: c.id, source: 'cost' as const, label: c.name, description: c.description, area: null, amount: c.amount })),
  ]
  const expenseAnnual: RecurringRow[] = [
    ...recurringItems
      .filter(r => r.type === 'expense' && r.frequency === 'annual')
      .map(r => ({ id: r.id, source: 'cashflow' as const, label: r.category, description: r.description, area: r.area, amount: r.amount })),
    ...costs
      .filter(c => c.cost_type === 'fixed_annual')
      .map(c => ({ id: c.id, source: 'cost' as const, label: c.name, description: c.description, area: null, amount: c.amount })),
  ]

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

    const result = isPassive
      ? await createRecurringCashFlow({
          type, amount: amountNum, frequency, category, area: area || null, description: description || undefined,
        })
      : await createTransaction({
          amount: amountNum, type, category, note: description || undefined, area: area || null, date,
        })

    setIsSubmitting(false)

    if (result.error) {
      setFormError(result.error)
      return
    }

    setAmount('')
    setDescription('')
    setDate(new Date().toISOString().slice(0, 10))
    setArea('')
    setShowForm(false)
    startTransition(() => { router.refresh() })
  }

  function handleDeleteTransaction(id: string) {
    startTransition(async () => {
      await deleteTransaction(id)
      router.refresh()
    })
  }

  function handleDeleteRecurring(id: string) {
    startTransition(async () => {
      await deleteRecurringCashFlow(id)
      router.refresh()
    })
  }

  const categories = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES

  return (
    <div className="bg-white border border-border rounded-2xl p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wallet size={16} strokeWidth={1.5} className="text-emerald-600" />
          <h2 className="text-base font-semibold text-foreground">Příjmy &amp; Výdaje</h2>
        </div>
        <button
          onClick={() => setShowForm(f => !f)}
          className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg px-3 py-1.5 transition-colors"
        >
          <Plus size={13} strokeWidth={2} />
          Přidat
        </button>
      </div>

      {/* Month picker */}
      <div className="flex items-center justify-center gap-3">
        <button onClick={() => navigateMonth('prev')} className="p-1.5 hover:bg-muted rounded-lg transition-colors">
          <ChevronLeft size={16} strokeWidth={1.5} className="text-muted-foreground" />
        </button>
        <span className="text-sm font-semibold text-foreground w-36 text-center">{formatMonth(currentMonth)}</span>
        <button onClick={() => navigateMonth('next')} className="p-1.5 hover:bg-muted rounded-lg transition-colors">
          <ChevronRight size={16} strokeWidth={1.5} className="text-muted-foreground" />
        </button>
      </div>

      {/* Celkový přehled měsíce */}
      <MonthSummaryBar summary={summary} />

      {/* Add form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-muted/30 border border-border rounded-xl p-4 space-y-3">
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

          <div className="flex gap-2">
            {([false, true] as const).map(passive => (
              <button
                key={String(passive)}
                type="button"
                onClick={() => setIsPassive(passive)}
                className={`flex-1 py-1.5 text-xs font-medium rounded-lg border transition-colors flex items-center justify-center gap-1.5 ${
                  isPassive === passive
                    ? 'bg-slate-700 text-white border-slate-700'
                    : 'bg-white text-muted-foreground border-border hover:border-foreground/20'
                }`}
              >
                {passive
                  ? <><RefreshCw size={11} strokeWidth={2} /> Opakovaný</>
                  : <><Tag size={11} strokeWidth={2} /> Jednorázový</>
                }
              </button>
            ))}
          </div>

          {isPassive && (
            <div className="flex gap-2">
              {(['monthly', 'annual'] as const).map(f => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFrequency(f)}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                    frequency === f
                      ? 'bg-slate-600 text-white border-slate-600'
                      : 'bg-white text-muted-foreground border-border hover:border-foreground/20'
                  }`}
                >
                  {f === 'monthly' ? 'Měsíčně' : 'Ročně'}
                </button>
              ))}
            </div>
          )}

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
              <label className="text-xs font-medium text-muted-foreground block mb-1">Oblast</label>
              <select
                value={area}
                onChange={e => setArea(e.target.value)}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              >
                <option value="">— bez oblasti —</option>
                {LIFE_AREAS.map(a => (
                  <option key={a} value={a}>{AREA_LABELS[a]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Popis</label>
              <input
                type="text"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Volitelně..."
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
            </div>
          </div>

          {!isPassive && (
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
          )}

          {type === 'expense' && area === 'byznys' && (
            <div className="flex items-start gap-2 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
              <AlertCircle size={13} className="shrink-0 mt-0.5" strokeWidth={1.5} />
              Byznys výdaj bude automaticky přidán do sekce Náklady a přepočítán v Kalkulačce výdělků.
            </div>
          )}

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
              {isPassive ? 'Uložit opakovanou' : 'Uložit'}
            </button>
          </div>
        </form>
      )}

      {/* Two columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <ArrowUpCircle size={15} strokeWidth={1.5} className="text-emerald-600" />
              <h3 className="text-sm font-semibold text-foreground">Příjmy</h3>
            </div>
            <span className="text-sm font-semibold text-emerald-600 tabular-nums">
              +{formatAmount(incomeOneTimeTotal)}
            </span>
          </div>
          <ColumnSection
            oneTimeItems={incomeOneTime}
            monthlyItems={incomeMonthly}
            annualItems={incomeAnnual}
            onDeleteTransaction={handleDeleteTransaction}
            onDeleteRecurring={handleDeleteRecurring}
            isPending={isPending}
            currentMonth={currentMonth}
          />
        </div>

        <div className="space-y-3 lg:border-l lg:border-border lg:pl-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <ArrowDownCircle size={15} strokeWidth={1.5} className="text-red-500" />
              <h3 className="text-sm font-semibold text-foreground">Výdaje</h3>
            </div>
            <span className="text-sm font-semibold text-red-500 tabular-nums">
              −{formatAmount(expenseOneTimeTotal)}
            </span>
          </div>
          <ColumnSection
            oneTimeItems={expenseOneTime}
            monthlyItems={expenseMonthly}
            annualItems={expenseAnnual}
            onDeleteTransaction={handleDeleteTransaction}
            onDeleteRecurring={handleDeleteRecurring}
            isPending={isPending}
            currentMonth={currentMonth}
          />
        </div>
      </div>
    </div>
  )
}
