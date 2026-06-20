'use client'

import { useState } from 'react'
import { TrendingUp, Clock, Wallet, Calculator, ChevronDown } from 'lucide-react'
import type { CompletedProject, Cost } from '@/lib/types'

function fmt(n: number) {
  return n.toLocaleString('cs-CZ', { maximumFractionDigits: 0 })
}

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: string
  sub?: string
  accent?: 'green' | 'red' | 'blue' | 'default'
}) {
  const color =
    accent === 'green'
      ? 'text-emerald-700'
      : accent === 'red'
        ? 'text-red-600'
        : accent === 'blue'
          ? 'text-brand-700'
          : 'text-foreground'

  return (
    <div className="bg-white border border-border rounded-xl p-4 shadow-sm">
      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1.5">{label}</p>
      <p className={`text-2xl font-bold ${color} leading-none`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  )
}

export default function EarningsCalculator({
  projects,
  costs,
}: {
  projects: CompletedProject[]
  costs: Cost[]
}) {
  const [months, setMonths] = useState(12)
  const [showBreakdown, setShowBreakdown] = useState(false)

  const totalEarnings = projects.reduce((s, p) => s + Number(p.amount), 0)
  const clientProjects = projects.filter(p => p.project_type === 'client')
  const clientEarnings = clientProjects.reduce((s, p) => s + Number(p.amount), 0)
  const personalEarnings = projects.filter(p => p.project_type === 'personal').reduce((s, p) => s + Number(p.amount), 0)
  const totalHours = projects.reduce((s, p) => s + (p.time_invested != null ? Number(p.time_invested) : 0), 0)
  const clientHours = clientProjects.reduce((s, p) => s + (p.time_invested != null ? Number(p.time_invested) : 0), 0)
  const personalHours = totalHours - clientHours
  const avgDifficulty = projects.length > 0
    ? projects.reduce((s, p) => s + p.difficulty, 0) / projects.length
    : 0

  const fixedMonthlyCosts = costs.filter(c => c.cost_type === 'fixed_monthly').reduce((s, c) => s + Number(c.amount), 0)
  const fixedAnnualCosts = costs.filter(c => c.cost_type === 'fixed_annual').reduce((s, c) => s + Number(c.amount), 0)
  const oneTimeCosts = costs.filter(c => c.cost_type === 'one_time').reduce((s, c) => s + Number(c.amount), 0)

  const periodicCosts = fixedMonthlyCosts * months + (fixedAnnualCosts / 12) * months
  const totalCosts = periodicCosts + oneTimeCosts + personalEarnings
  const netEarnings = totalEarnings - totalCosts

  const grossHourlyRate = clientHours > 0 ? clientEarnings / clientHours : 0
  const netHourlyRate = clientHours > 0 ? (clientEarnings - (periodicCosts + oneTimeCosts)) / clientHours : 0

  const hasCosts = costs.length > 0 || personalEarnings > 0

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-brand-50 rounded-lg flex items-center justify-center">
            <Calculator size={15} className="text-brand-600" strokeWidth={1.5} />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">Kalkulačka výdělků</h3>
            <p className="text-xs text-muted-foreground">
              Celkem {projects.length} {projects.length === 1 ? 'zakázka' : projects.length < 5 ? 'zakázky' : 'zakázek'}
              {totalHours > 0 && ` · ${fmt(totalHours)} hodin práce`}
            </p>
          </div>
        </div>
        {hasCosts && (
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground whitespace-nowrap">Počet měsíců (fixní náklady):</label>
            <input
              type="number"
              min="1"
              max="120"
              value={months}
              onChange={e => setMonths(Math.max(1, Number(e.target.value) || 1))}
              className="w-16 text-sm border border-border rounded-md px-2 py-1 text-center focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Celkové příjmy"
          value={`${fmt(totalEarnings)} Kč`}
          sub={personalEarnings > 0 ? `${fmt(clientEarnings)} Kč klienti · ${fmt(personalEarnings)} Kč osobní` : undefined}
          accent="blue"
        />
        <StatCard
          label="Celkový čas"
          value={totalHours > 0 ? `${fmt(totalHours)} h` : '—'}
          sub={
            clientHours > 0 && personalHours > 0
              ? `${fmt(clientHours)} h klienti · ${fmt(personalHours)} h osobní`
              : avgDifficulty > 0
                ? `Průměrná náročnost: ${avgDifficulty.toFixed(1)}/10`
                : undefined
          }
        />
        <StatCard
          label="Celkové náklady"
          value={hasCosts ? `${fmt(totalCosts)} Kč` : '—'}
          sub={
            hasCosts
              ? personalEarnings > 0
                ? `vč. ${fmt(personalEarnings)} Kč osobní projekty`
                : `za ${months} měs. + jednorázové`
              : 'Žádné náklady'
          }
          accent={hasCosts ? 'red' : 'default'}
        />
        <StatCard
          label="Čistý výdělek"
          value={hasCosts ? `${fmt(netEarnings)} Kč` : `${fmt(totalEarnings)} Kč`}
          sub={hasCosts && netEarnings < 0 ? 'Ve ztrátě' : undefined}
          accent={!hasCosts || netEarnings >= 0 ? 'green' : 'red'}
        />
      </div>

      {clientHours > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white border border-border rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp size={14} className="text-brand-500" strokeWidth={1.5} />
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Hodinová sazba (hrubá)</p>
            </div>
            <p className="text-2xl font-bold text-foreground">
              {fmt(grossHourlyRate)} Kč/h
            </p>
            <p className="text-xs text-muted-foreground mt-1">klientské příjmy / čas klientů</p>
          </div>
          <div className="bg-white border border-border rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <Wallet size={14} className="text-emerald-500" strokeWidth={1.5} />
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Hodinová sazba (čistá)</p>
            </div>
            <p className={`text-2xl font-bold ${costs.length > 0 && netHourlyRate >= 0 ? 'text-emerald-700' : costs.length > 0 ? 'text-red-600' : 'text-foreground'}`}>
              {costs.length > 0 ? `${fmt(netHourlyRate)} Kč/h` : '—'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {costs.length > 0 ? 'klientský výdělek po nákladech' : 'Přidej náklady v sekci Náklady'}
            </p>
          </div>
        </div>
      )}

      {hasCosts && (
        <div className="bg-slate-50 border border-border rounded-xl overflow-hidden">
          <button
            onClick={() => setShowBreakdown(!showBreakdown)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-slate-100 transition-colors"
          >
            <span className="flex items-center gap-2">
              <Clock size={14} strokeWidth={1.5} />
              Detail nákladů
            </span>
            <ChevronDown size={14} className={`transition-transform ${showBreakdown ? 'rotate-180' : ''}`} />
          </button>
          {showBreakdown && (
            <div className="border-t border-border divide-y divide-border">
              {fixedMonthlyCosts > 0 && (
                <div className="px-4 py-2.5 flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Fixní měsíční × {months} měs.</span>
                  <span className="font-medium text-foreground">{fmt(fixedMonthlyCosts * months)} Kč</span>
                </div>
              )}
              {fixedAnnualCosts > 0 && (
                <div className="px-4 py-2.5 flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Fixní roční ({months} měs. poměrně)</span>
                  <span className="font-medium text-foreground">{fmt((fixedAnnualCosts / 12) * months)} Kč</span>
                </div>
              )}
              {oneTimeCosts > 0 && (
                <div className="px-4 py-2.5 flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Jednorázové náklady</span>
                  <span className="font-medium text-foreground">{fmt(oneTimeCosts)} Kč</span>
                </div>
              )}
              {personalEarnings > 0 && (
                <div className="px-4 py-2.5 flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Osobní projekty</span>
                  <span className="font-medium text-foreground">{fmt(personalEarnings)} Kč</span>
                </div>
              )}
              <div className="px-4 py-2.5 flex justify-between items-center text-sm bg-white">
                <span className="font-semibold text-foreground">Celkové náklady</span>
                <span className="font-bold text-red-600">{fmt(totalCosts)} Kč</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
