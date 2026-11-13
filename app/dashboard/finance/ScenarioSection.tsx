'use client'

import { useMemo, useState } from 'react'
import {
  Sparkles, TrendingUp, TrendingDown, Scale, Percent,
  Tag, RefreshCw, CheckCircle2, AlertTriangle, XCircle, Info,
} from 'lucide-react'
import type { MonthSummary, FinanceHealthOverview, AllTimeSummary } from './finance-actions'

type Scenario = 'income' | 'expense'
type Recurrence = 'onetime' | 'monthly'
type Period = 'month' | 'all'
type Tone = 'good' | 'warning' | 'bad'

const MONTHS_FULL = [
  'Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen',
  'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec',
]

const QUICK_AMOUNTS = [1000, 5000, 10000, 25000, 50000]

const TONE_STYLE: Record<Tone, string> = {
  good: 'bg-navy-50 border-navy-200 text-navy-900',
  warning: 'bg-signal-bg border-signal-line text-signal-ink',
  bad: 'bg-danger/5 border-danger/30 text-danger',
}

const TONE_ICON: Record<Tone, typeof CheckCircle2> = {
  good: CheckCircle2,
  warning: AlertTriangle,
  bad: XCircle,
}

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

function pctChange(from: number, to: number): number | null {
  if (from === 0) return null
  return ((to - from) / Math.abs(from)) * 100
}

function formatPct(pct: number) {
  return `${pct > 0 ? '+' : ''}${pct.toFixed(1)} %`
}

function getVerdict(oldNet: number, newNet: number): { tone: Tone; title: string; body: string } {
  const delta = newNet - oldNet
  const pct = pctChange(oldNet, newNet)
  const pctPart = pct !== null ? ` (${formatPct(pct)})` : ''
  const wasProfitable = oldNet >= 0
  const staysProfitable = newNet >= 0

  if (wasProfitable && staysProfitable) {
    if (delta >= 0) {
      return {
        tone: 'good',
        title: 'Zůstáváš ziskový',
        body: `Bilance vzroste o ${formatAmount(delta)}${pctPart} — z ${formatAmount(oldNet)} na ${formatAmount(newNet)}.`,
      }
    }
    return {
      tone: 'warning',
      title: 'Zisk se zmenší, ale zůstaneš v plusu',
      body: `Bilance klesne o ${formatAmount(Math.abs(delta))}${pctPart} — z ${formatAmount(oldNet)} na ${formatAmount(newNet)}.`,
    }
  }

  if (wasProfitable && !staysProfitable) {
    return {
      tone: 'bad',
      title: 'Propadneš se do ztráty',
      body: `Bilance se zhorší o ${formatAmount(Math.abs(delta))} a spadne z ${formatAmount(oldNet)} na ${formatAmount(newNet)}.`,
    }
  }

  if (!wasProfitable && staysProfitable) {
    return {
      tone: 'good',
      title: 'Dostaneš se zpět do zisku',
      body: `Bilance se zlepší o ${formatAmount(delta)} a vyšplhá z ${formatAmount(oldNet)} na ${formatAmount(newNet)}.`,
    }
  }

  if (delta > 0) {
    return {
      tone: 'warning',
      title: 'Ztráta se zmenší, ale zůstaneš v mínusu',
      body: `Bilance se zlepší o ${formatAmount(delta)}${pctPart}, ale zůstaneš ve ztrátě ${formatAmount(newNet)}.`,
    }
  }
  return {
    tone: 'bad',
    title: 'Ztráta se prohloubí',
    body: `Bilance se zhorší o ${formatAmount(Math.abs(delta))}${pctPart} a klesne na ${formatAmount(newNet)}.`,
  }
}

function DeltaCard({
  icon, label, before, after, bg, valueColor, deltaText, deltaColor, formatValue = formatAmount,
}: {
  icon: React.ReactNode
  label: string
  before: number
  after: number
  bg: string
  valueColor?: string
  deltaText?: string | null
  deltaColor?: string
  formatValue?: (n: number) => string
}) {
  return (
    <div className={`rounded-chip p-3 ${bg}`}>
      <div className="flex items-center gap-1.5 mb-1.5">
        {icon}
        <span className="text-xs text-quiet">{label}</span>
      </div>
      <p className="text-xs text-quiet line-through decoration-1 decoration-quiet/50">
        {formatValue(before)}
      </p>
      <p className={`text-base font-semibold tabular-nums ${valueColor ?? 'text-ink'}`}>
        {formatValue(after)}
      </p>
      {deltaText && (
        <p className={`text-[11px] font-medium mt-0.5 ${deltaColor ?? 'text-quiet'}`}>{deltaText}</p>
      )}
    </div>
  )
}

function VerdictBanner({ verdict }: { verdict: { tone: Tone; title: string; body: string } }) {
  const Icon = TONE_ICON[verdict.tone]
  return (
    <div className={`flex items-start gap-3 rounded-chip border p-4 ${TONE_STYLE[verdict.tone]}`}>
      <Icon size={18} strokeWidth={1.5} className="shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-semibold">{verdict.title}</p>
        <p className="text-xs mt-0.5 opacity-90">{verdict.body}</p>
      </div>
    </div>
  )
}

interface Props {
  summary: MonthSummary
  overview: FinanceHealthOverview
  allTime: AllTimeSummary
}

export function ScenarioSection({ summary, overview, allTime }: Props) {
  const [scenario, setScenario] = useState<Scenario>('income')
  const [recurrence, setRecurrence] = useState<Recurrence>('onetime')
  const [period, setPeriod] = useState<Period>('month')
  const [amount, setAmount] = useState('10000')

  const amountNum = Math.max(0, parseFloat(amount.replace(',', '.')) || 0)

  const primary = useMemo(() => {
    const baseIncome = period === 'month' ? summary.income : allTime.income
    const baseExpense = period === 'month' ? summary.expense : allTime.expense
    const baseNet = period === 'month' ? summary.net : allTime.net

    const newIncome = scenario === 'income' ? baseIncome + amountNum : baseIncome
    const newExpense = scenario === 'expense' ? baseExpense + amountNum : baseExpense
    const newNet = newIncome - newExpense

    const volumeBefore = scenario === 'income' ? baseIncome : baseExpense
    const volumeAfter = scenario === 'income' ? newIncome : newExpense
    const volumePct = pctChange(volumeBefore, volumeAfter)

    const netDelta = newNet - baseNet
    const netPct = pctChange(baseNet, newNet)

    const savingsRateBefore = baseIncome > 0 ? (baseNet / baseIncome) * 100 : null
    const savingsRateAfter = newIncome > 0 ? (newNet / newIncome) * 100 : null

    return {
      baseNet, newNet, volumeBefore, volumeAfter, volumePct, netDelta, netPct,
      savingsRateBefore, savingsRateAfter, verdict: getVerdict(baseNet, newNet),
    }
  }, [scenario, amountNum, period, summary, allTime])

  const annual = useMemo(() => {
    const annualAmount = amountNum * 12
    const baseIncome12m = overview.income12m
    const baseExpense12m = overview.expense12m
    const baseSavings12m = overview.savings12m

    const newIncome12m = scenario === 'income' ? baseIncome12m + annualAmount : baseIncome12m
    const newExpense12m = scenario === 'expense' ? baseExpense12m + annualAmount : baseExpense12m
    const newSavings12m = newIncome12m - newExpense12m

    const volumeBefore = scenario === 'income' ? baseIncome12m : baseExpense12m
    const volumeAfter = scenario === 'income' ? newIncome12m : newExpense12m
    const volumePct = pctChange(volumeBefore, volumeAfter)

    const netDelta = newSavings12m - baseSavings12m
    const netPct = pctChange(baseSavings12m, newSavings12m)

    return {
      volumeBefore, volumeAfter, volumePct, newSavings12m, baseSavings12m, netDelta, netPct,
      verdict: getVerdict(baseSavings12m, newSavings12m),
    }
  }, [scenario, amountNum, overview])

  return (
    <div className="bg-surface border border-navy-100 rounded-box p-6 space-y-5">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Sparkles size={16} strokeWidth={1.5} className="text-navy-600" />
          <h2 className="text-base font-semibold text-ink">Co kdyby analýza</h2>
        </div>
        <p className="text-xs text-quiet">
          Zadej částku a hned uvidíš, jak jedno rozhodnutí ovlivní tvůj byznys — tento měsíc, celkově i za rok dopředu
        </p>
      </div>

      {/* Controls */}
      <div className="bg-muted/30 border border-navy-100 rounded-chip p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-quiet">Vztáhnout k</span>
          <div className="flex gap-1 bg-surface border border-navy-100 rounded-full p-0.5">
            {(['month', 'all'] as const).map(p => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={`text-xs font-medium px-3 py-1 rounded-full transition-colors ${
                  period === p ? 'bg-navy-700 text-white' : 'text-quiet hover:text-ink'
                }`}
              >
                {p === 'month' ? 'Tento měsíc' : 'Celkově'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          {(['income', 'expense'] as const).map(s => (
            <button
              key={s}
              type="button"
              onClick={() => setScenario(s)}
              className={`flex-1 py-2.5 text-sm font-medium rounded-chip border transition-colors flex items-center justify-center gap-1.5 ${
                scenario === s
                  ? s === 'income'
                    ? 'border-navy-700 bg-navy-700 text-white'
                    : 'border-navy-700 bg-navy-700 text-white'
                  : 'bg-surface text-quiet border-navy-100 hover:border-foreground/20'
              }`}
            >
              {s === 'income' ? <TrendingUp size={14} strokeWidth={2} /> : <TrendingDown size={14} strokeWidth={2} />}
              {s === 'income' ? 'Vydělám navíc' : 'Utratím navíc'}
            </button>
          ))}
        </div>

        <div>
          <label className="text-xs font-medium text-quiet block mb-1">Částka (Kč)</label>
          <input
            type="number"
            min="0"
            step="100"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="10000"
            className="w-full rounded-chip border border-input bg-surface px-3.5 py-2.5 text-[15px] text-ink transition-colors focus-visible:border-navy-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {QUICK_AMOUNTS.map(q => (
            <button
              key={q}
              type="button"
              onClick={() => setAmount(String(q))}
              className={`text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
                amountNum === q
                  ? 'border-navy-700 bg-navy-700 text-white'
                  : 'bg-surface text-quiet border-navy-100 hover:border-foreground/20'
              }`}
            >
              {q.toLocaleString('cs-CZ')} Kč
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          {(['onetime', 'monthly'] as const).map(r => (
            <button
              key={r}
              type="button"
              onClick={() => setRecurrence(r)}
              className={`flex-1 py-1.5 text-xs font-medium rounded-chip border transition-colors flex items-center justify-center gap-1.5 ${
                recurrence === r
                  ? 'border-navy-700 bg-navy-700 text-white'
                  : 'bg-surface text-quiet border-navy-100 hover:border-foreground/20'
              }`}
            >
              {r === 'onetime' ? <Tag size={11} strokeWidth={2} /> : <RefreshCw size={11} strokeWidth={2} />}
              {r === 'onetime' ? 'Jednorázově' : 'Každý měsíc'}
            </button>
          ))}
        </div>
      </div>

      {/* Primary impact (this month or all-time, per period toggle) */}
      <div className="space-y-2">
        <p className="text-[11px] font-medium text-quiet uppercase tracking-wide">
          {period === 'month' ? `Dopad na tento měsíc · ${formatMonth(summary.month)}` : 'Dopad na celkové hospodaření · za celou dobu'}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <DeltaCard
            icon={
              scenario === 'income'
                ? <TrendingUp size={14} strokeWidth={1.5} className="text-navy-600" />
                : <TrendingDown size={14} strokeWidth={1.5} className="text-quiet" />
            }
            label={scenario === 'income' ? 'Objem příjmů' : 'Objem výdajů'}
            before={primary.volumeBefore}
            after={primary.volumeAfter}
            bg={scenario === 'income' ? 'bg-navy-50' : 'border border-navy-100'}
            deltaText={primary.volumePct !== null ? formatPct(primary.volumePct) : 'nový zdroj'}
          />
          <DeltaCard
            icon={<Scale size={14} strokeWidth={1.5} className={primary.newNet >= 0 ? 'text-navy-600' : 'text-danger'} />}
            label="Bilance (zisk/ztráta)"
            before={primary.baseNet}
            after={primary.newNet}
            bg={primary.newNet >= 0 ? 'bg-navy-50' : 'bg-danger/5'}
            valueColor={primary.newNet >= 0 ? 'text-ink' : 'text-danger'}
            deltaText={`${primary.netDelta >= 0 ? '+' : ''}${formatAmount(primary.netDelta)}${primary.netPct !== null ? ` (${formatPct(primary.netPct)})` : ''}`}
            deltaColor={primary.netDelta >= 0 ? 'text-ink' : 'text-danger'}
          />
          <DeltaCard
            icon={<Percent size={14} strokeWidth={1.5} className="text-navy-600" />}
            label="Míra úspor"
            before={primary.savingsRateBefore ?? 0}
            after={primary.savingsRateAfter ?? 0}
            bg="border border-navy-100"
            formatValue={n => `${Math.round(n)} %`}
          />
        </div>
      </div>

      <VerdictBanner verdict={primary.verdict} />

      {/* Annual impact (recurring only) */}
      {recurrence === 'monthly' && (
        <div className="space-y-2 pt-2 border-t border-navy-100">
          <p className="text-[11px] font-medium text-quiet uppercase tracking-wide pt-3 flex items-center gap-1.5">
            <RefreshCw size={11} strokeWidth={1.5} />
            Výhled na příštích 12 měsíců při pravidelném opakování
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <DeltaCard
              icon={
                scenario === 'income'
                  ? <TrendingUp size={14} strokeWidth={1.5} className="text-navy-600" />
                  : <TrendingDown size={14} strokeWidth={1.5} className="text-quiet" />
              }
              label={scenario === 'income' ? 'Roční objem příjmů' : 'Roční objem výdajů'}
              before={annual.volumeBefore}
              after={annual.volumeAfter}
              bg={scenario === 'income' ? 'bg-navy-50' : 'border border-navy-100'}
              deltaText={annual.volumePct !== null ? formatPct(annual.volumePct) : 'nový zdroj'}
            />
            <DeltaCard
              icon={<Scale size={14} strokeWidth={1.5} className={annual.newSavings12m >= 0 ? 'text-navy-600' : 'text-danger'} />}
              label="Roční bilance"
              before={annual.baseSavings12m}
              after={annual.newSavings12m}
              bg={annual.newSavings12m >= 0 ? 'bg-navy-50' : 'bg-danger/5'}
              valueColor={annual.newSavings12m >= 0 ? 'text-ink' : 'text-danger'}
              deltaText={`${annual.netDelta >= 0 ? '+' : ''}${formatAmount(annual.netDelta)}${annual.netPct !== null ? ` (${formatPct(annual.netPct)})` : ''}`}
              deltaColor={annual.netDelta >= 0 ? 'text-ink' : 'text-danger'}
            />
          </div>

          <VerdictBanner verdict={annual.verdict} />

          <p className="text-[11px] text-quiet flex items-center gap-1">
            <Info size={11} strokeWidth={1.5} />
            Roční základ vychází ze skutečných dat za posledních 12 měsíců.
          </p>
        </div>
      )}
    </div>
  )
}
