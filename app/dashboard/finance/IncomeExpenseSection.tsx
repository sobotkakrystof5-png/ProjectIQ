'use client'
import { Badge } from '@/components/ui/badge'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Wallet, Plus, ChevronLeft, ChevronRight,
  Trash2, AlertCircle, Loader2,
  RefreshCw, Tag, ExternalLink, ArrowUpCircle, ArrowDownCircle,
  TrendingUp, TrendingDown, Scale, ArrowUpRight, ArrowDownRight,
} from 'lucide-react'
import { toast } from '@/components/ui/toast'
import {
  createTransaction, deleteTransaction, setTransactionDeclared,
  createRecurringCashFlow, deleteRecurringCashFlow, generateRecurringTransactions,
  type FinanceTransaction, type TransactionType,
  type RecurringCashFlow, type RecurringFrequency, type MonthSummary,
} from './finance-actions'
import type { Cost } from '@/lib/types'
import { BASE_CURRENCY } from '@/lib/money-currency'
import {
  INCOME_CATEGORIES, EXPENSE_CATEGORIES,
  LIFE_AREAS, AREA_LABELS, type LifeArea,
} from './finance-constants'
import { cn } from '@/lib/utils'

/** Pole Dílků: rádius 12 px, navy okraj při zaostření (DESIGN.md → Inputs). */
const fieldClass =
  'w-full rounded-chip border border-input bg-surface px-3.5 py-2.5 text-[15px] text-ink transition-colors placeholder:text-quiet focus-visible:border-navy-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30'

const MONTHS_FULL = [
  'Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen',
  'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec',
]

function formatMonth(month: string) {
  const [year, mon] = month.split('-')
  return `${MONTHS_FULL[parseInt(mon) - 1]} ${year}`
}

function formatAmount(amount: number, currency: string = BASE_CURRENCY) {
  return new Intl.NumberFormat('cs-CZ', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatDate(dateStr: string) {
  const [year, mon, day] = dateStr.split('-').map(Number)
  return new Date(year, mon - 1, day).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short' })
}

function AreaBadge({ area }: { area: string | null }) {
  if (!area) return null
  return <Badge variant="neutral">{AREA_LABELS[area as LifeArea] ?? area}</Badge>
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
    <div className="flex items-center gap-2.5 py-2 px-2.5 bg-muted/20 hover:bg-muted/40 rounded-chip group transition-colors">
      <RefreshCw size={11} strokeWidth={1.5} className="text-quiet shrink-0" />
      <div className="min-w-0 flex-1">
        <span className="text-sm font-medium text-ink">{row.label}</span>
        {row.description && (
          <span className="text-xs text-quiet ml-2 truncate">{row.description}</span>
        )}
      </div>
      {row.area && <AreaBadge area={row.area} />}
      {row.source === 'cost' ? (
        <Link
          href="/dashboard/naklady"
          className="hidden sm:flex items-center gap-1 text-[10px] text-quiet bg-muted px-1.5 py-0.5 rounded-full hover:text-ink transition-colors shrink-0"
        >
          <ExternalLink size={9} strokeWidth={1.5} />
          Náklady zakázek
        </Link>
      ) : null}
      <span className="text-sm font-semibold text-ink shrink-0 tabular-nums">
        {formatAmount(row.amount)}
      </span>
      {row.source === 'cashflow' ? (
        <button
          onClick={() => onDelete(row.id)}
          disabled={isPending}
          className="shrink-0 p-1 text-quiet opacity-0 transition-all hover:text-danger group-hover:opacity-100 disabled:opacity-30"
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
  oneTimeItems, monthlyItems, annualItems, onDeleteTransaction, onDeleteRecurring, onToggleDeclared, isPending, currentMonth,
}: {
  oneTimeItems: FinanceTransaction[]
  monthlyItems: RecurringRow[]
  annualItems: RecurringRow[]
  onDeleteTransaction: (id: string) => void
  onDeleteRecurring: (id: string) => void
  onToggleDeclared: (id: string, declared: boolean) => void
  isPending: boolean
  currentMonth: string
}) {
  return (
    <div className="space-y-4">
      {/* Jednorázové */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <Tag size={11} strokeWidth={1.5} className="text-quiet" />
          <span className="text-[11px] font-medium text-quiet uppercase tracking-wide">
            Jednorázové · {formatMonth(currentMonth)}
          </span>
        </div>
        {oneTimeItems.length === 0 ? (
          <p className="text-xs text-quiet py-2">Žádné položky tento měsíc</p>
        ) : (
          <div className="space-y-0.5">
            {oneTimeItems.map(t => (
              <div key={t.id} className="flex items-center gap-2.5 py-2 px-2.5 hover:bg-muted/40 rounded-chip group transition-colors">
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-medium text-ink">{t.category}</span>
                  {t.note && <span className="text-xs text-quiet ml-2 truncate">{t.note}</span>}
                </div>
                {t.type === 'income' && (
                  <button
                    type="button"
                    onClick={() => onToggleDeclared(t.id, !t.declared)}
                    disabled={isPending}
                    title={
                      t.declared
                        ? 'Přiznaný příjem — klikni pro přeřazení do nepřiznané linie'
                        : 'Nepřiznaný příjem — klikni pro označení jako fakturováno na IČO'
                    }
                    className={cn(
                      'inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold transition-colors disabled:opacity-40',
                      t.declared
                        ? 'bg-navy-700 text-white hover:bg-navy-800'
                        : 'bg-navy-50 text-quiet opacity-0 hover:bg-navy-100 group-hover:opacity-100',
                    )}
                  >
                    IČO
                  </button>
                )}
                {t.area && <AreaBadge area={t.area} />}
                <span className="text-xs text-quiet shrink-0">{formatDate(t.date)}</span>
                {/* Vlastní měna řádku (migrace 109) — eurová faktura se nesmí
                    tvářit jako koruny jen proto, že je v témže seznamu. */}
                <span className="text-sm font-semibold text-ink shrink-0 tabular-nums">{formatAmount(t.amount, t.currency)}</span>
                <button
                  onClick={() => onDeleteTransaction(t.id)}
                  disabled={isPending}
                  className="shrink-0 p-1 text-quiet opacity-0 transition-all hover:text-danger group-hover:opacity-100 disabled:opacity-30"
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
          <RefreshCw size={11} strokeWidth={1.5} className="text-quiet" />
          <span className="text-[11px] font-medium text-quiet uppercase tracking-wide">Měsíčně</span>
        </div>
        {monthlyItems.length === 0 ? (
          <p className="text-xs text-quiet py-2">Žádné opakované položky</p>
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
          <RefreshCw size={11} strokeWidth={1.5} className="text-quiet" />
          <span className="text-[11px] font-medium text-quiet uppercase tracking-wide">Ročně</span>
        </div>
        {annualItems.length === 0 ? (
          <p className="text-xs text-quiet py-2">Žádné opakované položky</p>
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
      {/*
        Dlaždice byly čtyři barevné plochy — zelená, červená, modrá, fialová —
        a barva neříkala nic než „tohle je jiná dlaždice". Dílky zelenou nemají
        a červená je vyhrazená pro chybu (R-091, DESIGN.md). Příjem a výdaj
        rozlišuje tvar jako ve Workspace: příjem plný, výdaj obrysem. Červená
        zůstává jen tam, kde je bilance opravdu v minusu.
      */}
      <div className="rounded-chip bg-navy-50 p-3">
        <div className="mb-1 flex items-center gap-1.5">
          <TrendingUp size={14} strokeWidth={1.5} className="text-navy-600" />
          <span className="text-xs text-quiet">Příjmy celkem</span>
        </div>
        <p className="font-num text-base font-semibold tabular-nums text-ink">{formatAmount(income)}</p>
      </div>

      <div className="rounded-chip border border-navy-100 p-3">
        <div className="mb-1 flex items-center gap-1.5">
          <TrendingDown size={14} strokeWidth={1.5} className="text-quiet" />
          <span className="text-xs text-quiet">Výdaje celkem</span>
        </div>
        <p className="font-num text-base font-semibold tabular-nums text-ink">{formatAmount(expense)}</p>
      </div>

      <div className={cn('rounded-chip p-3', net >= 0 ? 'bg-navy-50' : 'bg-danger/5')}>
        <div className="mb-1 flex items-center gap-1.5">
          <Scale size={14} strokeWidth={1.5} className={net >= 0 ? 'text-navy-600' : 'text-danger'} />
          <span className="text-xs text-quiet">Bilance</span>
        </div>
        <p className={cn('font-num text-base font-semibold tabular-nums', net >= 0 ? 'text-ink' : 'text-danger')}>
          {net >= 0 ? '+' : ''}{formatAmount(net)}
        </p>
        <p className="mt-0.5 text-[11px] text-quiet">
          Míra úspor: {savingsRate === null ? '—' : `${Math.round(savingsRate)} %`}
        </p>
      </div>

      <div className="rounded-chip border border-navy-100 p-3">
        <div className="mb-1 flex items-center gap-1.5">
          {netChange >= 0
            ? <ArrowUpRight size={14} strokeWidth={1.5} className="text-navy-600" />
            : <ArrowDownRight size={14} strokeWidth={1.5} className="text-danger" />}
          <span className="text-xs text-quiet">Meziměsíční změna</span>
        </div>
        <p className={cn('font-num text-base font-semibold tabular-nums', netChange >= 0 ? 'text-ink' : 'text-danger')}>
          {netChange >= 0 ? '+' : ''}{formatAmount(netChange)}
          {netChangePct !== null && (
            <span className="text-xs font-medium ml-1">
              ({netChangePct >= 0 ? '+' : ''}{Math.round(netChangePct)} %)
            </span>
          )}
        </p>
        <p className="text-[11px] text-quiet mt-0.5">
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
  /** Dnešek v Praze, spočítaný na serveru (AD13). */
  todayIso: string
}

export function IncomeExpenseSection({ transactions, currentMonth, recurringItems, costs, summary, todayIso }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [showForm, setShowForm] = useState(false)
  const [type, setType] = useState<TransactionType>('income')
  const [isPassive, setIsPassive] = useState(false)
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly')
  const [category, setCategory] = useState<string>(INCOME_CATEGORIES[0])
  const [area, setArea] = useState<string>('')
  const [amount, setAmount] = useState('')
  // Dnešek v Praze ze serveru. `new Date().toISOString()` je kalendářní datum
  // v UTC, které je po pražské půlnoci ještě včerejší — transakce by se
  // uložila na předchozí den, a u 31. 12. do jiného daňového roku (AD13).
  const [date, setDate] = useState(todayIso)
  const [description, setDescription] = useState('')
  const [declared, setDeclared] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)

  async function handleGenerateRecurring() {
    setIsGenerating(true)
    try {
      await generateRecurringTransactions()
      toast.success('Opakované položky jsou doplněné')
      router.refresh()
    } catch {
      toast.error('Opakované položky se nepodařilo doplnit')
    } finally {
      setIsGenerating(false)
    }
  }

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
    router.push(`/dashboard/finance?month=${newMonth}`)
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
          declared,
        })

    setIsSubmitting(false)

    if (result.error) {
      setFormError(result.error)
      return
    }

    setAmount('')
    setDescription('')
    setDate(todayIso)
    setArea('')
    setDeclared(false)
    setShowForm(false)
    startTransition(() => { router.refresh() })
  }

  function handleToggleDeclared(id: string, declared: boolean) {
    startTransition(async () => {
      await setTransactionDeclared(id, declared)
      router.refresh()
    })
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
    <div className="bg-surface border border-navy-100 rounded-box p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wallet size={16} strokeWidth={1.5} className="text-navy-500" />
          <h2 className="text-base font-semibold text-ink">Příjmy &amp; Výdaje</h2>
        </div>
        <div className="flex items-center gap-2">
          {/*
            Opakované položky doplňuje denní cron; dřív je zakládal render
            téhle stránky (AD08). Tlačítko je pro případ, že cron neproběhl
            nebo se šablona přidala dnes.
          */}
          <button
            onClick={handleGenerateRecurring}
            disabled={isGenerating}
            // Dílky, ne staré admin třídy — strop v admin-classes.test.ts
            className="flex items-center gap-1.5 rounded-full border border-navy-100 bg-surface px-3 py-1.5 text-xs font-medium text-quiet transition-colors hover:bg-accent disabled:opacity-60"
          >
            {isGenerating
              ? <Loader2 size={13} strokeWidth={1.5} className="animate-spin" />
              : <RefreshCw size={13} strokeWidth={1.5} />}
            Doplnit opakované
          </button>
          <button
            onClick={() => setShowForm(f => !f)}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-input px-4 text-sm font-semibold text-ink transition-colors hover:bg-navy-50"
          >
            <Plus size={13} strokeWidth={2} />
            Přidat
          </button>
        </div>
      </div>

      {/* Month picker */}
      <div className="flex items-center justify-center gap-3">
        <button onClick={() => navigateMonth('prev')} className="p-1.5 hover:bg-muted rounded-chip transition-colors">
          <ChevronLeft size={16} strokeWidth={1.5} className="text-quiet" />
        </button>
        <span className="text-sm font-semibold text-ink w-36 text-center">{formatMonth(currentMonth)}</span>
        <button onClick={() => navigateMonth('next')} className="p-1.5 hover:bg-muted rounded-chip transition-colors">
          <ChevronRight size={16} strokeWidth={1.5} className="text-quiet" />
        </button>
      </div>

      {/* Celkový přehled měsíce */}
      <MonthSummaryBar summary={summary} />

      {/* Add form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="space-y-3 rounded-chip border border-navy-100 bg-navy-50/60 p-4">
          <div className="flex gap-2">
            {(['income', 'expense'] as const).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => handleTypeChange(t)}
                className={cn(
                  'inline-flex min-h-11 flex-1 items-center justify-center rounded-full border text-sm font-semibold transition-colors',
                  type === t
                    ? 'border-navy-700 bg-navy-700 text-white'
                    : 'border-input bg-surface text-quiet hover:border-navy-300',
                )}
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
                className={cn(
                  'inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full border text-xs font-semibold transition-colors',
                  isPassive === passive
                    ? 'border-navy-700 bg-navy-700 text-white'
                    : 'border-input bg-surface text-quiet hover:border-navy-300',
                )}
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
                  className={cn(
                    'inline-flex min-h-11 flex-1 items-center justify-center rounded-full border text-xs font-semibold transition-colors',
                    frequency === f
                      ? 'border-navy-700 bg-navy-700 text-white'
                      : 'border-input bg-surface text-quiet hover:border-navy-300',
                  )}
                >
                  {f === 'monthly' ? 'Měsíčně' : 'Ročně'}
                </button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-quiet block mb-1">Kategorie</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className={fieldClass}
              >
                {categories.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-quiet block mb-1">Částka (Kč)</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0"
                required
                className={fieldClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-quiet block mb-1">Oblast</label>
              <select
                value={area}
                onChange={e => setArea(e.target.value)}
                className={fieldClass}
              >
                <option value="">— bez oblasti —</option>
                {LIFE_AREAS.map(a => (
                  <option key={a} value={a}>{AREA_LABELS[a]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-quiet block mb-1">Popis</label>
              <input
                type="text"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Volitelně..."
                className={fieldClass}
              />
            </div>
          </div>

          {!isPassive && (
            <div>
              <label className="text-xs font-medium text-quiet block mb-1">Datum</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                required
                className={fieldClass}
              />
            </div>
          )}

          {type === 'income' && !isPassive && (
            <div className="border border-navy-100 rounded-chip overflow-hidden">
              <div className="grid grid-cols-2">
                <button
                  type="button"
                  onClick={() => setDeclared(false)}
                  className={cn(
                    'min-h-11 text-sm transition-colors',
                    !declared ? 'bg-navy-100 font-semibold text-ink' : 'bg-surface text-quiet hover:bg-navy-50',
                  )}
                >
                  Nepřiznaný
                </button>
                <button
                  type="button"
                  onClick={() => setDeclared(true)}
                  className={cn(
                    'min-h-11 text-sm transition-colors',
                    declared ? 'bg-navy-700 font-semibold text-white' : 'bg-surface text-quiet hover:bg-navy-50',
                  )}
                >
                  Přiznaný (na IČO)
                </button>
              </div>
              <p className="text-xs text-quiet px-3 py-2 border-t border-navy-100 bg-muted/20 leading-snug">
                {declared
                  ? 'Půjde do daňového přiznání a započítá se do daňové kalkulačky.'
                  : 'Zůstane mimo daňový základ — v přehledu Podnikání ho najdeš v nepřiznané linii.'}
              </p>
            </div>
          )}

          {type === 'expense' && area === 'byznys' && (
            <div className="flex items-start gap-2 rounded-chip border border-navy-100 bg-navy-50 px-3 py-2 text-xs text-navy-900">
              <AlertCircle size={13} className="shrink-0 mt-0.5" strokeWidth={1.5} />
              Byznys výdaj bude automaticky přidán do sekce Náklady a přepočítán v Kalkulačce výdělků.
            </div>
          )}

          {formError && (
            <div className="flex items-center gap-2 text-xs text-danger">
              <AlertCircle size={12} strokeWidth={2} />
              {formError}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => { setShowForm(false); setFormError(null) }}
              className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full border border-input text-sm font-semibold text-quiet transition-colors hover:bg-navy-50"
            >
              Zrušit
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full bg-navy-700 text-sm font-semibold text-white transition-colors hover:bg-navy-800 disabled:opacity-60"
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
              <ArrowUpCircle size={15} strokeWidth={1.5} className="text-navy-600" />
              <h3 className="text-sm font-semibold text-ink">Příjmy</h3>
            </div>
            <span className="font-num text-sm font-semibold tabular-nums text-ink">
              +{formatAmount(incomeOneTimeTotal)}
            </span>
          </div>
          <ColumnSection
            oneTimeItems={incomeOneTime}
            monthlyItems={incomeMonthly}
            annualItems={incomeAnnual}
            onDeleteTransaction={handleDeleteTransaction}
            onDeleteRecurring={handleDeleteRecurring}
            onToggleDeclared={handleToggleDeclared}
            isPending={isPending}
            currentMonth={currentMonth}
          />
        </div>

        <div className="space-y-3 lg:border-l lg:border-navy-100 lg:pl-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <ArrowDownCircle size={15} strokeWidth={1.5} className="text-quiet" />
              <h3 className="text-sm font-semibold text-ink">Výdaje</h3>
            </div>
            <span className="font-num text-sm font-semibold tabular-nums text-quiet">
              −{formatAmount(expenseOneTimeTotal)}
            </span>
          </div>
          <ColumnSection
            oneTimeItems={expenseOneTime}
            monthlyItems={expenseMonthly}
            annualItems={expenseAnnual}
            onDeleteTransaction={handleDeleteTransaction}
            onDeleteRecurring={handleDeleteRecurring}
            onToggleDeclared={handleToggleDeclared}
            isPending={isPending}
            currentMonth={currentMonth}
          />
        </div>
      </div>
    </div>
  )
}
