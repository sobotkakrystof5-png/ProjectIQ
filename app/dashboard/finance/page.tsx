import { Calculator, BarChart3, Info } from 'lucide-react'
import { PageHeader, PageShell } from '@/components/ws/app/page-header'
import { PillNav } from '@/components/ws/app/toolbar'
import { TileGlyph } from '@/components/ws/brand'
import { TradingViewChart } from '@/components/TradingViewChart'
import { CompoundCalculator } from '@/components/CompoundCalculator'
import { IncomeExpenseSection } from './IncomeExpenseSection'
import { FinanceHealthSection } from './FinanceHealthSection'
import { ScenarioSection } from './ScenarioSection'
import { BusinessSection } from './BusinessSection'
import { BusinessCalculator } from './BusinessCalculator'
import { getBusinessOverview } from './byznys-actions'
import {
  getTransactions,
  getRecurringCashFlow, getFinanceHealthOverview, getMonthSummary, getAllTimeSummary,
  getBusinessIncome,
} from './finance-actions'
import { getCosts } from '@/app/costs-actions'
import { getInvoices, getInvoiceProjectOptions } from './invoice-actions'
import { getTaxNews } from './tax-news-actions'
import { getPragueTodayISO } from '@/lib/prague-time'

type Tab = 'osobni' | 'podnikani'

const TABS: { key: Tab; label: string }[] = [
  { key: 'osobni', label: 'Osobní' },
  { key: 'podnikani', label: 'Podnikání' },
]

export default async function FinancePage(
  props: {
    searchParams: Promise<{ month?: string; tab?: string; year?: string }>
  }
) {
  const searchParams = await props.searchParams
  // Záložka žije v URL, ne ve state — odkaz na Podnikání se dá poslat
  // i uložit a přežije reload.
  const tab: Tab = searchParams.tab === 'podnikani' ? 'podnikani' : 'osobni'
  const currentMonth = searchParams.month ?? new Date().toISOString().slice(0, 7)
  const year = Number(searchParams.year) || new Date().getFullYear()

  // Opakované transakce se **nezakládají při čtení** (AD08). GET nemá
  // zapisovat a prefetch odkazu by generování spustil, i když stránku
  // nikdo neotevře. Dělá to denní cron `/api/cron/send-reminders`
  // a tlačítko „Vygenerovat opakované" v Příjmech a výdajích.
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

  // Výkonnost podnikání (dřív rozcestník /hub/byznys, AD03) patří k Podnikání:
  // jsou to stejné peníze, jen celková a ne daňová optika.
  const [businessIncome, invoices, projectOptions, taxNews, businessOverview] =
    tab === 'podnikani'
      ? await Promise.all([
          getBusinessIncome(year), getInvoices(year), getInvoiceProjectOptions(), getTaxNews(),
          getBusinessOverview(),
        ])
      : [null, null, null, null, null]

  return (
    <PageShell width="wide" className="gap-8">
      <PageHeader
        title="Finance"
        subtitle={
          tab === 'osobni'
            ? 'Přehled majetku, cash flow a investiční kalkulačky.'
            : 'Přiznané a nepřiznané příjmy, daně a odvody.'
        }
        subtitleFont="sans"
      />

      <PillNav
        label="Část financí"
        variant="segmented"
        items={TABS.map(({ key, label }) => ({
          key,
          label,
          href: key === 'osobni' ? `/dashboard/finance?month=${currentMonth}` : `/dashboard/finance?tab=podnikani&year=${year}`,
          active: tab === key,
        }))}
        className="self-start"
      />

      {businessIncome && (
        <>
          <BusinessSection
            summary={businessIncome}
            invoices={invoices!}
            projectOptions={projectOptions!}
            taxNews={taxNews!}
            todayIso={getPragueTodayISO()}
          />
          <div className="border-t border-navy-100 pt-6">
            <BusinessCalculator overview={businessOverview!} />
          </div>
        </>
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
            className="flex items-center gap-1.5 rounded-full border border-navy-100 bg-surface px-3 py-1.5 text-sm"
          >
            <TileGlyph size={5} />
            <span className="font-semibold text-ink">{etf.name}</span>
            <span className="text-xs text-quiet">{etf.desc}</span>
          </div>
        ))}
      </div>

      {/* TradingView Chart */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
            <BarChart3 size={16} strokeWidth={1.5} className="text-navy-500" aria-hidden="true" />
            Graf ETF
          </h2>
          <p className="flex items-center gap-1 text-xs text-quiet">
            <Info size={12} strokeWidth={1.5} aria-hidden="true" />
            Data z TradingView
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
        <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
          <Calculator size={16} strokeWidth={1.5} className="text-navy-500" aria-hidden="true" />
          Investice (mimo cash flow)
        </h2>
        <CompoundCalculator />
      </div>
        </>
      )}
    </PageShell>
  )
}
