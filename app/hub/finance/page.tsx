import { TrendingUp, Calculator, BarChart3, Info } from 'lucide-react'
import { TradingViewChart } from '@/components/TradingViewChart'
import { CompoundCalculator } from '@/components/CompoundCalculator'
import { CashFlowSection } from './CashFlowSection'
import { FixedCostsSection } from './FixedCostsSection'
import {
  getTransactions, getMonthlyAggregates,
  generateRecurringCostTransactions, generateRecurringCashFlowTransactions,
  getCosts, getRecurringCashFlow,
} from './finance-actions'

export default async function FinancePage({
  searchParams,
}: {
  searchParams: { month?: string }
}) {
  const currentMonth = searchParams.month ?? new Date().toISOString().slice(0, 7)

  await Promise.all([
    generateRecurringCostTransactions(),
    generateRecurringCashFlowTransactions(),
  ])

  const [transactions, monthlyAggregates, costs, recurringItems] = await Promise.all([
    getTransactions(currentMonth),
    getMonthlyAggregates(),
    getCosts(),
    getRecurringCashFlow(),
  ])

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
          <p className="text-sm text-muted-foreground">ETF tracker, cash flow a investiční kalkulačky</p>
        </div>
      </div>

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

      {/* Fixní náklady */}
      <FixedCostsSection costs={costs} />

      {/* Cash Flow */}
      <CashFlowSection
        transactions={transactions}
        monthlyAggregates={monthlyAggregates}
        currentMonth={currentMonth}
        recurringItems={recurringItems}
      />

      {/* Compound calculator */}
      <div className="space-y-2">
        <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
          <Calculator size={16} strokeWidth={1.5} className="text-emerald-600" />
          Kalkulačka složeného úroku
        </h2>
        <CompoundCalculator />
      </div>
    </div>
  )
}
