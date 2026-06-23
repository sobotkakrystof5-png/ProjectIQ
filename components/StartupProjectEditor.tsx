'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  ChevronDown, ChevronUp, Loader2, Archive, Trash2,
  ExternalLink, Save, Info, BookOpen, Calculator,
  Lightbulb, StickyNote, Link2, Rocket, TrendingUp,
} from 'lucide-react'
import {
  STARTUP_PHASES, STARTUP_SEGMENTS, STARTUP_CURRENCIES,
  type StartupProject, type StartupImprovement, type StartupChangelogEntry,
  type StartupPhase, type MonetizationModel,
} from '@/lib/types'
import {
  updateStartupProject,
  archiveStartupProject,
  deleteStartupProject,
} from '@/app/hub/byznys/startup/startup-actions'
import { StartupImprovements } from '@/components/StartupImprovements'
import { StartupChangelog } from '@/components/StartupChangelog'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat('cs-CZ', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount)
}

function numOrNull(v: string): number | null {
  const n = parseFloat(v.replace(',', '.'))
  return isNaN(n) ? null : n
}
function intOrNull(v: string): number | null {
  const n = parseInt(v)
  return isNaN(n) ? null : n
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({
  id, title, icon, open, onToggle, children,
}: {
  id: string
  title: string
  icon: React.ReactNode
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div className="bg-white border border-border rounded-2xl overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <span className="text-muted-foreground">{icon}</span>
          <span className="font-medium text-foreground text-sm">{title}</span>
        </div>
        {open
          ? <ChevronUp size={15} strokeWidth={1.5} className="text-muted-foreground" />
          : <ChevronDown size={15} strokeWidth={1.5} className="text-muted-foreground" />
        }
      </button>
      {open && (
        <div className="px-5 pb-5 border-t border-border pt-4 space-y-4">
          {children}
        </div>
      )}
    </div>
  )
}

// ─── Field primitives ─────────────────────────────────────────────────────────

const inputCls = 'w-full px-3.5 py-2.5 text-sm border border-border rounded-xl bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-colors'
const textareaCls = `${inputCls} resize-none`
const labelCls = 'block text-sm font-medium text-foreground mb-1.5'

// ─── CalcCard ─────────────────────────────────────────────────────────────────

function CalcCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-muted/40 rounded-xl p-3.5">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className="text-base font-semibold text-foreground">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  )
}

// ─── MiniBarChart (monthly revenue 1–12) ─────────────────────────────────────

function MiniBarChart({ data, currency }: { data: number[]; currency: string }) {
  const max = Math.max(...data, 1)
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-2">Kumulativní příjem (MRR × měsíce)</p>
      <div className="flex items-end gap-1 h-16">
        {data.map((v, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
            <div
              className="w-full brand-gradient rounded-sm transition-all"
              style={{ height: `${(v / max) * 52}px` }}
              title={formatCurrency(v, currency)}
            />
            {(i === 0 || i === 5 || i === 11) && (
              <span className="text-[9px] text-muted-foreground">{i + 1}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main Editor ─────────────────────────────────────────────────────────────

interface Props {
  project: StartupProject
  improvements: StartupImprovement[]
  changelog: StartupChangelogEntry[]
}

type SectionId = 'basic' | 'plan' | 'calc' | 'know_how' | 'notes' | 'url' | 'phase' | 'improvements' | 'changelog'

export function StartupProjectEditor({ project, improvements, changelog }: Props) {
  const router = useRouter()

  // ── Form state ──
  const [name, setName] = useState(project.name)
  const [segmentSelect, setSegmentSelect] = useState(
    STARTUP_SEGMENTS.includes(project.segment) ? project.segment : '__custom__'
  )
  const [customSegment, setCustomSegment] = useState(
    STARTUP_SEGMENTS.includes(project.segment) ? '' : project.segment
  )
  const [problem, setProblem] = useState(project.problem)
  const [monetization, setMonetization] = useState(project.monetization)
  const [plan, setPlan] = useState(project.plan ?? '')
  const [knowHow, setKnowHow] = useState(project.know_how ?? '')
  const [notes, setNotes] = useState(project.notes ?? '')
  const [liveUrl, setLiveUrl] = useState(project.live_url ?? '')
  const [phase, setPhase] = useState<StartupPhase>(project.phase)
  const [progress, setProgress] = useState(project.progress)
  const [currency, setCurrency] = useState(project.currency)

  // Calculator
  const [plannedInvestment, setPlannedInvestment] = useState(project.planned_investment?.toString() ?? '')
  const [totalUsers, setTotalUsers] = useState(project.total_users?.toString() ?? '')
  const [payingUsersPct, setPayingUsersPct] = useState(project.paying_users_pct?.toString() ?? '')
  const [monetizationModel, setMonetizationModel] = useState<MonetizationModel>(project.monetization_model)
  const [monthlyPrice, setMonthlyPrice] = useState(project.monthly_price?.toString() ?? '')
  const [annualPrice, setAnnualPrice] = useState(project.annual_price?.toString() ?? '')
  const [annualDiscountPct, setAnnualDiscountPct] = useState(project.annual_discount_pct?.toString() ?? '0')
  const [onetimePrice, setOnetimePrice] = useState(project.onetime_price?.toString() ?? '')

  // ── UI state ──
  const [open, setOpen] = useState<Set<SectionId>>(new Set<SectionId>(['basic', 'phase', 'changelog']))
  const [saving, setSaving] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const toggle = (s: SectionId) =>
    setOpen(prev => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n })

  const effectiveSegment = segmentSelect === '__custom__' ? customSegment : segmentSelect

  // ── Calc results ──
  const payingUsers = useMemo(() => {
    const tu = parseFloat(totalUsers) || 0
    const pct = parseFloat(payingUsersPct) || 0
    return Math.round(tu * (pct / 100))
  }, [totalUsers, payingUsersPct])

  const calcResults = useMemo(() => {
    const inv = parseFloat(plannedInvestment) || 0
    if (monetizationModel === 'saas') {
      const mp = parseFloat(monthlyPrice) || 0
      const ap = parseFloat(annualPrice) || 0
      const adp = parseFloat(annualDiscountPct) || 0
      const mrr = payingUsers * mp
      const arr = payingUsers * ap * (1 - adp / 100)
      const breakEven = mrr > 0 && inv > 0 ? Math.ceil(inv / mrr) : null
      const monthlyGrowth = Array.from({ length: 12 }, (_, i) => mrr * (i + 1))
      return { type: 'saas' as const, mrr, arr, breakEven, monthlyGrowth }
    } else {
      const op = parseFloat(onetimePrice) || 0
      const totalRevenue = payingUsers * op
      const netProfit = totalRevenue - inv
      const roi = inv > 0 ? (netProfit / inv) * 100 : null
      return { type: 'onetime' as const, totalRevenue, netProfit, roi }
    }
  }, [monetizationModel, payingUsers, monthlyPrice, annualPrice, annualDiscountPct, onetimePrice, plannedInvestment])

  // ── Actions ──
  const handleSave = async () => {
    if (!name.trim()) { toast.error('Název projektu je povinný'); return }
    if (!effectiveSegment.trim()) { toast.error('Segment je povinný'); return }
    if (!problem.trim()) { toast.error('Popis problému je povinný'); return }

    setSaving(true)
    const result = await updateStartupProject(project.id, {
      name: name.trim(),
      segment: effectiveSegment.trim(),
      problem: problem.trim(),
      monetization,
      plan: plan.trim() || null,
      know_how: knowHow.trim() || null,
      notes: notes.trim() || null,
      live_url: liveUrl.trim() || null,
      phase,
      progress,
      currency,
      planned_investment: numOrNull(plannedInvestment),
      total_users: intOrNull(totalUsers),
      paying_users_pct: numOrNull(payingUsersPct),
      monetization_model: monetizationModel,
      monthly_price: numOrNull(monthlyPrice),
      annual_price: numOrNull(annualPrice),
      annual_discount_pct: numOrNull(annualDiscountPct),
      onetime_price: numOrNull(onetimePrice),
    })
    setSaving(false)
    if (result.error) toast.error(result.error)
    else toast.success('Projekt uložen')
  }

  const handleArchive = async () => {
    setArchiving(true)
    await archiveStartupProject(project.id)
  }

  const handleDelete = async () => {
    setDeleting(true)
    await deleteStartupProject(project.id)
  }

  const currentPhase = STARTUP_PHASES.find(p => p.value === phase) ?? STARTUP_PHASES[0]

  return (
    <div className="space-y-3">
      {/* Sticky save bar */}
      <div className="flex items-center justify-between py-3 px-5 bg-white border border-border rounded-2xl">
        <div className="flex items-center gap-2.5">
          <span className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full ${currentPhase.color}`}>
            {currentPhase.emoji} {currentPhase.label}
          </span>
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <span className="tabular-nums font-medium text-foreground">{progress} %</span>
            <span>hotovo</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!confirmDelete ? (
            <>
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="p-2 text-muted-foreground hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                title="Smazat projekt"
              >
                <Trash2 size={15} strokeWidth={1.5} />
              </button>
              <button
                type="button"
                onClick={handleArchive}
                disabled={archiving}
                className="p-2 text-muted-foreground hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                title="Archivovat projekt"
              >
                {archiving
                  ? <Loader2 size={15} strokeWidth={1.5} className="animate-spin" />
                  : <Archive size={15} strokeWidth={1.5} />
                }
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-xl hover:bg-brand-700 disabled:opacity-50 transition-colors shadow-sm"
              >
                {saving
                  ? <Loader2 size={13} strokeWidth={1.5} className="animate-spin" />
                  : <Save size={13} strokeWidth={1.5} />
                }
                {saving ? 'Ukládá se…' : 'Uložit'}
              </button>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm text-red-600 font-medium">Opravdu smazat?</span>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {deleting && <Loader2 size={12} strokeWidth={1.5} className="animate-spin" />}
                Smazat
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Zrušit
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── SECTION: Základní informace ── */}
      <Section
        id="basic"
        title="Základní informace"
        icon={<Info size={15} strokeWidth={1.5} />}
        open={open.has('basic')}
        onToggle={() => toggle('basic')}
      >
        <div>
          <label className={labelCls}>Název projektu <span className="text-red-500">*</span></label>
          <input type="text" value={name} onChange={e => setName(e.target.value)} className={inputCls} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Segment / Kategorie <span className="text-red-500">*</span></label>
            <select
              value={segmentSelect}
              onChange={e => setSegmentSelect(e.target.value)}
              className={inputCls}
            >
              {STARTUP_SEGMENTS.map(s => <option key={s} value={s}>{s}</option>)}
              <option value="__custom__">Vlastní...</option>
            </select>
            {segmentSelect === '__custom__' && (
              <input
                type="text"
                value={customSegment}
                onChange={e => setCustomSegment(e.target.value)}
                placeholder="Vlastní kategorie"
                className={`${inputCls} mt-2`}
              />
            )}
          </div>
          <div className="flex flex-col justify-center">
            <label className={labelCls}>Monetizace</label>
            <div className="flex items-center justify-between px-3.5 py-2.5 bg-muted/40 rounded-xl">
              <span className="text-sm text-foreground">{monetization ? 'Ano' : 'Ne'}</span>
              <button
                type="button"
                onClick={() => setMonetization(v => !v)}
                className={`relative w-10 h-5 rounded-full transition-colors ${monetization ? 'bg-brand-600' : 'bg-muted-foreground/20'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${monetization ? 'translate-x-5' : ''}`} />
              </button>
            </div>
          </div>
        </div>
        <div>
          <label className={labelCls}>Problém, který projekt řeší <span className="text-red-500">*</span></label>
          <textarea
            value={problem}
            onChange={e => setProblem(e.target.value)}
            rows={4}
            placeholder="Popiš konkrétní problém nebo potřebu…"
            className={textareaCls}
          />
        </div>
      </Section>

      {/* ── SECTION: Fáze projektu ── */}
      <Section
        id="phase"
        title="Fáze projektu"
        icon={<Rocket size={15} strokeWidth={1.5} />}
        open={open.has('phase')}
        onToggle={() => toggle('phase')}
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {STARTUP_PHASES.map(p => (
            <button
              key={p.value}
              type="button"
              onClick={() => setPhase(p.value)}
              className={`text-left px-3 py-2.5 rounded-xl border text-xs font-medium transition-all ${
                phase === p.value
                  ? `${p.color} border-current shadow-sm`
                  : 'border-border text-muted-foreground hover:border-brand-300 hover:text-foreground'
              }`}
            >
              <span className="mr-1">{p.emoji}</span>
              {p.label}
            </button>
          ))}
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-foreground">Celkový postup projektu</label>
            <span className="text-sm font-semibold text-brand-700 tabular-nums">{progress} %</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={progress}
            onChange={e => setProgress(Number(e.target.value))}
            className="w-full accent-brand-600"
          />
          <div className="mt-1.5 h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full brand-gradient rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </Section>

      {/* ── SECTION: Plán / Strategie ── */}
      <Section
        id="plan"
        title="Plán / Strategie"
        icon={<BookOpen size={15} strokeWidth={1.5} />}
        open={open.has('plan')}
        onToggle={() => toggle('plan')}
      >
        <textarea
          value={plan}
          onChange={e => setPlan(e.target.value)}
          rows={8}
          placeholder="Popiš strategii, kroky, milníky, cílový trh…"
          className={textareaCls}
        />
      </Section>

      {/* ── SECTION: Finanční kalkulačka ── */}
      <Section
        id="calc"
        title="Finanční kalkulačka"
        icon={<Calculator size={15} strokeWidth={1.5} />}
        open={open.has('calc')}
        onToggle={() => toggle('calc')}
      >
        {/* Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Plánovaná investice</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={plannedInvestment}
                onChange={e => setPlannedInvestment(e.target.value)}
                placeholder="0"
                min={0}
                className={`${inputCls} flex-1`}
              />
              <select
                value={currency}
                onChange={e => setCurrency(e.target.value)}
                className="px-3 py-2.5 text-sm border border-border rounded-xl bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-colors"
              >
                {STARTUP_CURRENCIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className={labelCls}>Celkový počet uživatelů</label>
            <input
              type="number"
              value={totalUsers}
              onChange={e => setTotalUsers(e.target.value)}
              placeholder="1000"
              min={0}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>% platících uživatelů</label>
            <input
              type="number"
              value={payingUsersPct}
              onChange={e => setPayingUsersPct(e.target.value)}
              placeholder="5"
              min={0}
              max={100}
              step="0.1"
              className={inputCls}
            />
            {payingUsers > 0 && (
              <p className="text-xs text-muted-foreground mt-1">{payingUsers} platících uživatelů</p>
            )}
          </div>
        </div>

        {/* Model toggle */}
        <div className="flex items-center gap-1 p-1 bg-muted rounded-xl w-fit">
          {(['saas', 'onetime'] as const).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => setMonetizationModel(m)}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                monetizationModel === m
                  ? 'bg-white text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {m === 'saas' ? 'SaaS / Předplatné' : 'Jednorázový prodej'}
            </button>
          ))}
        </div>

        {/* Model-specific inputs */}
        {monetizationModel === 'saas' ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Měsíční cena ({currency})</label>
              <input
                type="number"
                value={monthlyPrice}
                onChange={e => setMonthlyPrice(e.target.value)}
                placeholder="9.99"
                min={0}
                step="0.01"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Roční cena ({currency})</label>
              <input
                type="number"
                value={annualPrice}
                onChange={e => setAnnualPrice(e.target.value)}
                placeholder="99"
                min={0}
                step="0.01"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Sleva roční vs. měsíční (%)</label>
              <input
                type="number"
                value={annualDiscountPct}
                onChange={e => setAnnualDiscountPct(e.target.value)}
                placeholder="20"
                min={0}
                max={100}
                className={inputCls}
              />
            </div>
          </div>
        ) : (
          <div className="max-w-xs">
            <label className={labelCls}>Jednorázová cena ({currency})</label>
            <input
              type="number"
              value={onetimePrice}
              onChange={e => setOnetimePrice(e.target.value)}
              placeholder="49"
              min={0}
              step="0.01"
              className={inputCls}
            />
          </div>
        )}

        {/* Results */}
        {calcResults.type === 'saas' && (calcResults.mrr > 0 || calcResults.arr > 0) && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <CalcCard
                label="MRR (měsíční výnos)"
                value={formatCurrency(calcResults.mrr, currency)}
              />
              <CalcCard
                label="ARR (roční výnos)"
                value={formatCurrency(calcResults.arr, currency)}
                sub="z ročního předplatného"
              />
              {calcResults.breakEven !== null && (
                <CalcCard
                  label="Break-even"
                  value={`${calcResults.breakEven} měs.`}
                  sub="kdy se vrátí investice"
                />
              )}
            </div>
            <MiniBarChart data={calcResults.monthlyGrowth} currency={currency} />
          </div>
        )}

        {calcResults.type === 'onetime' && calcResults.totalRevenue > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <CalcCard
              label="Celkový výnos"
              value={formatCurrency(calcResults.totalRevenue, currency)}
            />
            <CalcCard
              label="Čistý zisk"
              value={formatCurrency(calcResults.netProfit, currency)}
              sub={calcResults.netProfit >= 0 ? 'po odečtení investice' : 'ztráta'}
            />
            {calcResults.roi !== null && (
              <CalcCard
                label="ROI"
                value={`${calcResults.roi.toFixed(1)} %`}
                sub="návratnost investice"
              />
            )}
          </div>
        )}
      </Section>

      {/* ── SECTION: Know-how ── */}
      <Section
        id="know_how"
        title="Know-how"
        icon={<Lightbulb size={15} strokeWidth={1.5} />}
        open={open.has('know_how')}
        onToggle={() => toggle('know_how')}
      >
        <textarea
          value={knowHow}
          onChange={e => setKnowHow(e.target.value)}
          rows={7}
          placeholder="Interní znalosti, postupy, tipy, poučení z projektu…"
          className={textareaCls}
        />
      </Section>

      {/* ── SECTION: Osobní poznámky ── */}
      <Section
        id="notes"
        title="Osobní poznámky"
        icon={<StickyNote size={15} strokeWidth={1.5} />}
        open={open.has('notes')}
        onToggle={() => toggle('notes')}
      >
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={5}
          placeholder="Soukromé poznámky, myšlenky, nápady k projektu…"
          className={textareaCls}
        />
      </Section>

      {/* ── SECTION: Live URL ── */}
      <Section
        id="url"
        title="Live URL"
        icon={<Link2 size={15} strokeWidth={1.5} />}
        open={open.has('url')}
        onToggle={() => toggle('url')}
      >
        <div>
          <label className={labelCls}>URL projektu</label>
          <input
            type="url"
            value={liveUrl}
            onChange={e => setLiveUrl(e.target.value)}
            placeholder="https://mujprojekt.cz"
            className={inputCls}
          />
          {liveUrl && (
            <a
              href={liveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 mt-2 text-sm text-brand-600 hover:text-brand-700 transition-colors"
            >
              <ExternalLink size={13} strokeWidth={1.5} />
              Otevřít projekt
            </a>
          )}
        </div>
      </Section>

      {/* ── SECTION: Nápady na zlepšení ── */}
      <Section
        id="improvements"
        title="Nápady na zlepšení"
        icon={<TrendingUp size={15} strokeWidth={1.5} />}
        open={open.has('improvements')}
        onToggle={() => toggle('improvements')}
      >
        <StartupImprovements projectId={project.id} initialItems={improvements} />
      </Section>

      {/* ── SECTION: Changelog ── */}
      <Section
        id="changelog"
        title="Changelog / Audit log"
        icon={<BookOpen size={15} strokeWidth={1.5} />}
        open={open.has('changelog')}
        onToggle={() => toggle('changelog')}
      >
        <StartupChangelog projectId={project.id} initialEntries={changelog} />
      </Section>

      {/* Bottom save */}
      <div className="flex justify-end pb-4">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-600 text-white text-sm font-medium rounded-xl hover:bg-brand-700 disabled:opacity-50 transition-colors shadow-sm"
        >
          {saving
            ? <Loader2 size={14} strokeWidth={1.5} className="animate-spin" />
            : <Save size={14} strokeWidth={1.5} />
          }
          {saving ? 'Ukládá se…' : 'Uložit projekt'}
        </button>
      </div>
    </div>
  )
}
