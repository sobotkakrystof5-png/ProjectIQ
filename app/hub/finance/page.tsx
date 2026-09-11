import Link from 'next/link'
import { TrendingUp, Calculator, BarChart3, Info, User, Briefcase } from 'lucide-react'
import { TradingViewChart } from '@/components/TradingViewChart'
import { CompoundCalculator } from '@/components/CompoundCalculator'
import { IncomeExpenseSection } from './IncomeExpenseSection'
import { FinanceHealthSection } from './FinanceHealthSection'
import { ScenarioSection } from './ScenarioSection'
import { BusinessSection } from './BusinessSection'
import {
  getTransactions,
  generateRecurringCostTransactions, generateRecurringCashFlowTransactions,
  getCosts, getRecurringCashFlow, getFinanceHealthOverview, getMonthSummary, getAllTimeSummary,
  getBusinessIncome,
} from './finance-actions'
import { getInvoices, getInvoiceProjectOptions } from './invoice-actions'
import { getTaxNews } from './tax-news-actions'
import { getPragueTodayISO } from '@/lib/prague-time'

type Tab = 'osobni' | 'podnikani'

const TABS: { key: Tab; label: string; icon: typeof User }[] = [
  { key: 'osobni', label: 'Osobní', icon: User },
  { key: 'podnikani', label: 'Podnikání', icon: Briefcase },
]

export default async function FinancePage({
  searchParams,
}: {
  searchParams: { month?: string; tab?: string; year?: string }
}) {
  // Záložka žije v URL, ne ve state — odkaz na Podnikání se dá poslat
  // i uložit a přežije reload.
  const tab: Tab = searchParams.tab === 'podnikani' ? 'podnikani' : 'osobni'
  const currentMonth = searchParams.month ?? new Date().toISOString().slice(0, 7)
  const year = Number(searchParams.year) || new Date().getFullYear()

  await Promise.all([
    generateRecurringCostTransactions(),
    generateRecurringCashFlowTransactions(),
  ])

  // Data se tahají jen pro zobrazenou záložku — ta druhá by jinak platila
  // za dotazy, které nikdo neuvidí.
  const [transactions, healthOverview, costs, recurringItems, monthSummary, allTimeSummary] =
    tab === 'osobni'
      ? await Promise.all([
          getTransactions(currentMonth),
          getFinanceHealthOverview(),
          getCosts(),
          getRecurringCashFlow(),
          getMonthSummary(currentMonth),
          getAllTimeSummary(),
        ])
      : [null, null, null, null, null, null]

  const [businessIncome, invoices, projectOptions, taxNews] =
    tab === 'podnikani'
      ? await Promise.all([
          getBusinessIncome(year), getInvoices(year), getInvoiceProjectOptions(), getTaxNews(),
        ])
      : [null, null, null, null]

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center shadow-sm">
              <TrendingUp size={16} strokeWidth={1.5} className="text-white" />
            </div>
            <h1 className="text-2xl font-semibold text-foreground tracking-tight">Finance</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            {tab === 'osobni'
              ? 'ETF tracker, cash flow a investiční kalkulačky'
              : 'Přiznané a nepřiznané příjmy, daně a odvody'}
          </p>
        </div>
      </div>

      {/* Záložky */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map(({ key, label, icon: Icon }) => (
          <Link
            key={key}
            href={key === 'osobni' ? `/hub/finance?month=${currentMonth}` : `/hub/finance?tab=podnikani&year=${year}`}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm transition-colors border-b-2 -mb-px ${
              tab === key
                ? 'border-emerald-600 text-foreground font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon size={14} strokeWidth={1.5} />
            {label}
          </Link>
        ))}
      </div>

      {businessIncome && (
        <BusinessSection
          summary={businessIncome}
          invoices={invoices!}
          projectOptions={projectOptions!}
          taxNews={taxNews!}
          todayIso={getPragueTodayISO()}
        />
      )}

      {tab === 'osobni' && (
        <>
      {/* ETF Watchlist chips */}
      <div className="flex flex-wrap gap-2">
        {[
          { symbol: 'XETR:VWCE', name: 'VWCE', desc: 'All World' },
          { symbol: 'XETR:IWDA', name: 'IWDA', desc: 'World Dev.' },
          { symbol: 'XETR:EIMI', name: 'EIMI', desc: 'Emerging' },
          { symbol: 'XETR:XDWD', name: 'XDWD', desc: 'World ESG' },
        ].map(etf => (
          <div
            key={etf.symbol}
            className="flex items-center gap-1.5 bg-white border border-border rounded-full px-3 py-1.5 text-sm"
          >
            <span className="font-semibold text-emerald-700">{etf.name}</span>
            <span className="text-muted-foreground text-xs">{etf.desc}</span>
          </div>
        ))}
      </div>

      {/* TradingView Chart */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <BarChart3 size={16} strokeWidth={1.5} className="text-emerald-600" />
            ETF Graf
          </h2>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Info size={12} strokeWidth={1.5} />
            Powered by TradingView
          </p>
        </div>
        <TradingViewChart symbol="XETR:VWCE" interval="W" height={460} />
      </div>

      {/* Jak si stojíš */}
      <FinanceHealthSection overview={healthOverview!} />

      {/* Příjmy & Výdaje (sjednocené) */}
      <IncomeExpenseSection
        transactions={transactions!}
        currentMonth={currentMonth}
        recurringItems={recurringItems!}
        costs={costs!}
        summary={monthSummary!}
      />

      {/* Co kdyby analýza */}
      <ScenarioSection summary={monthSummary!} overview={healthOverview!} allTime={allTimeSummary!} />

      {/* Investice (mimo cash flow) */}
      <div className="space-y-2">
        <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
          <Calculator size={16} strokeWidth={1.5} className="text-emerald-600" />
          Investice (mimo cash flow)
        </h2>
        <CompoundCalculator />
      </div>
        </>
      )}
    </div>
  )
}
