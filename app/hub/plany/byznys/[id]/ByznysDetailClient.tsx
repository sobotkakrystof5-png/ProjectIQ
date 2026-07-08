'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronDown, Loader2, AlertCircle, Trash2, Plus, Pencil,
  CheckCircle2, Circle, Rocket, ExternalLink,
} from 'lucide-react'
import {
  updateBusiness, deleteBusiness, addBusinessPhase, updateBusinessPhase, deleteBusinessPhase, exportBusinessToStartup,
  type PlanBusiness, type PlanBusinessPhase, type PlanBusinessPayload, type PlanBusinessStatus,
  type PlanBusinessPhasePayload, type PlanBusinessPhaseStatus,
} from '../byznys-plan-actions'
import { cn, formatCurrency } from '@/lib/utils'

const STATUS_LABELS: Record<PlanBusinessStatus, string> = {
  planovani: 'Plánování',
  pripraveno_k_exportu: 'Připraveno k exportu',
  exportovano: 'Exportováno',
}

const PHASE_STATUS_LABELS: Record<PlanBusinessPhaseStatus, string> = {
  planovana: 'Plánovaná',
  aktivni: 'Aktivní',
  hotovo: 'Hotovo',
}

const SECTIONS: { key: keyof Pick<PlanBusinessPayload, 'goals' | 'current_situation' | 'growth_goals' | 'vision_10y'>; label: string; placeholder: string }[] = [
  { key: 'goals', label: 'Čeho chci v tomto byznysu dosáhnout', placeholder: 'Cíle...' },
  { key: 'current_situation', label: 'Jak na tom jsem teď', placeholder: 'Současný stav...' },
  { key: 'growth_goals', label: 'Růstové cíle', placeholder: 'Kam chci růst...' },
  { key: 'vision_10y', label: 'Kde to vidím za 10 let', placeholder: '10letá vize...' },
]

interface Props {
  business: PlanBusiness
  phases: PlanBusinessPhase[]
}

export function ByznysDetailClient({ business, phases }: Props) {
  const router = useRouter()
  const [form, setForm] = useState<PlanBusinessPayload>({
    title: business.title,
    goals: business.goals ?? '',
    current_situation: business.current_situation ?? '',
    growth_goals: business.growth_goals ?? '',
    vision_10y: business.vision_10y ?? '',
    budget: business.budget,
    currency: business.currency,
    status: business.status,
  })
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(SECTIONS.map((s) => [s.key, !!business[s.key]]))
  )
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const [showPhaseForm, setShowPhaseForm] = useState(false)
  const [editingPhaseId, setEditingPhaseId] = useState<string | null>(null)
  const [phaseForm, setPhaseForm] = useState<PlanBusinessPhasePayload>({ title: '', status: 'planovana', position: phases.length + 1 })
  const [phaseError, setPhaseError] = useState<string | null>(null)

  const [showExport, setShowExport] = useState(false)
  const [segment, setSegment] = useState('')
  const [exportError, setExportError] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)

  function toggleSection(key: string) {
    setOpenSections((s) => ({ ...s, [key]: !s[key] }))
  }

  async function handleSave() {
    setSaveError(null)
    if (!form.title.trim()) {
      setSaveError('Zadej název strategie')
      return
    }
    setIsSaving(true)
    const result = await updateBusiness(business.id, form)
    setIsSaving(false)
    if (result.error) {
      setSaveError(result.error)
      return
    }
    router.refresh()
  }

  async function handleDelete() {
    setIsDeleting(true)
    await deleteBusiness(business.id)
    router.push('/hub/plany/byznys')
  }

  function openAddPhase() {
    setEditingPhaseId(null)
    setPhaseForm({ title: '', status: 'planovana', position: phases.length + 1 })
    setPhaseError(null)
    setShowPhaseForm(true)
  }

  function openEditPhase(phase: PlanBusinessPhase) {
    setEditingPhaseId(phase.id)
    setPhaseForm({
      title: phase.title,
      description: phase.description ?? '',
      status: phase.status,
      position: phase.position,
      target_date: phase.target_date,
    })
    setPhaseError(null)
    setShowPhaseForm(true)
  }

  async function handleSavePhase(e: React.FormEvent) {
    e.preventDefault()
    setPhaseError(null)
    if (!phaseForm.title.trim()) {
      setPhaseError('Zadej název fáze')
      return
    }
    const result = editingPhaseId
      ? await updateBusinessPhase(editingPhaseId, business.id, phaseForm)
      : await addBusinessPhase(business.id, phaseForm)
    if (result.error) {
      setPhaseError(result.error)
      return
    }
    setShowPhaseForm(false)
    router.refresh()
  }

  async function handleDeletePhase(id: string) {
    await deleteBusinessPhase(id, business.id)
    router.refresh()
  }

  async function handleExport() {
    setExportError(null)
    if (!segment.trim()) {
      setExportError('Segment je povinný')
      return
    }
    setIsExporting(true)
    const result = await exportBusinessToStartup(business.id, segment)
    setIsExporting(false)
    if (result.error) {
      setExportError(result.error)
      return
    }
    router.push('/hub/byznys/startup')
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-border rounded-2xl p-6 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Název</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Status</label>
            <select
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as PlanBusinessStatus }))}
              className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
            >
              {(Object.keys(STATUS_LABELS) as PlanBusinessStatus[]).map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">Rozpočet (Kč)</label>
          <input
            type="number"
            min="0"
            value={form.budget ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, budget: e.target.value ? Number(e.target.value) : null }))}
            className="w-full sm:w-48 text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
          />
        </div>

        <div className="divide-y divide-border/60 border border-border/60 rounded-xl overflow-hidden">
          {SECTIONS.map((section) => (
            <div key={section.key}>
              <button
                type="button"
                onClick={() => toggleSection(section.key)}
                className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-muted/30 transition-colors"
              >
                <span className="text-xs font-medium text-foreground">{section.label}</span>
                <ChevronDown
                  size={14}
                  strokeWidth={1.5}
                  className={cn('text-muted-foreground transition-transform', openSections[section.key] && 'rotate-180')}
                />
              </button>
              {openSections[section.key] && (
                <div className="px-4 pb-3">
                  <textarea
                    value={form[section.key] ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, [section.key]: e.target.value }))}
                    placeholder={section.placeholder}
                    rows={3}
                    className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 resize-none"
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        {saveError && (
          <div className="flex items-center gap-2 text-red-600 text-xs">
            <AlertCircle size={12} strokeWidth={2} />
            {saveError}
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-red-500 transition-colors disabled:opacity-40"
          >
            <Trash2 size={13} strokeWidth={1.5} />
            Archivovat strategii
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 text-sm font-medium text-white bg-brand-800 hover:bg-brand-900 rounded-lg px-4 py-2 transition-colors disabled:opacity-60"
          >
            {isSaving && <Loader2 size={14} className="animate-spin" />}
            Uložit změny
          </button>
        </div>
      </div>

      {/* Phases timeline */}
      <div className="bg-white border border-border rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">Fáze</h2>
          <button
            onClick={openAddPhase}
            className="flex items-center gap-1.5 text-xs font-medium text-brand-800 bg-brand-50 hover:bg-brand-100 border border-brand-200 rounded-lg px-3 py-1.5 transition-colors"
          >
            <Plus size={13} strokeWidth={2} />
            Přidat fázi
          </button>
        </div>

        {phases.length > 0 && (
          <div className="flex items-center overflow-x-auto pb-2">
            {phases.map((phase, i) => (
              <div key={phase.id} className="flex items-center shrink-0">
                <div className="flex flex-col items-center gap-1 w-24">
                  {phase.status === 'hotovo' ? (
                    <CheckCircle2 size={16} strokeWidth={1.5} className="text-emerald-600" />
                  ) : phase.status === 'aktivni' ? (
                    <Circle size={16} strokeWidth={2} className="text-brand-700 fill-brand-100" />
                  ) : (
                    <Circle size={16} strokeWidth={1.5} className="text-muted-foreground" />
                  )}
                  <span className={cn('text-[10px] text-center truncate w-full', phase.status === 'aktivni' ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
                    {phase.title}
                  </span>
                </div>
                {i < phases.length - 1 && <div className="w-8 h-px bg-border shrink-0" />}
              </div>
            ))}
          </div>
        )}

        {showPhaseForm && (
          <form onSubmit={handleSavePhase} className="bg-muted/30 border border-border rounded-xl p-4 space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Název fáze</label>
              <input
                type="text"
                value={phaseForm.title}
                onChange={(e) => setPhaseForm((f) => ({ ...f, title: e.target.value }))}
                required
                autoFocus
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Popis</label>
              <textarea
                value={phaseForm.description ?? ''}
                onChange={(e) => setPhaseForm((f) => ({ ...f, description: e.target.value }))}
                rows={2}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 resize-none"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Status</label>
                <select
                  value={phaseForm.status}
                  onChange={(e) => setPhaseForm((f) => ({ ...f, status: e.target.value as PlanBusinessPhaseStatus }))}
                  className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                >
                  {(Object.keys(PHASE_STATUS_LABELS) as PlanBusinessPhaseStatus[]).map((s) => (
                    <option key={s} value={s}>{PHASE_STATUS_LABELS[s]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Pořadí</label>
                <input
                  type="number"
                  min={1}
                  value={phaseForm.position ?? 1}
                  onChange={(e) => setPhaseForm((f) => ({ ...f, position: Number(e.target.value) }))}
                  className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Termín</label>
                <input
                  type="date"
                  value={phaseForm.target_date ?? ''}
                  onChange={(e) => setPhaseForm((f) => ({ ...f, target_date: e.target.value || null }))}
                  className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                />
              </div>
            </div>
            {phaseError && (
              <div className="flex items-center gap-2 text-red-600 text-xs">
                <AlertCircle size={12} strokeWidth={2} />
                {phaseError}
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setShowPhaseForm(false)} className="flex-1 py-2 text-sm text-muted-foreground border border-border rounded-lg hover:bg-muted transition-colors">
                Zrušit
              </button>
              <button type="submit" className="flex-1 py-2 text-sm font-medium text-white bg-brand-800 hover:bg-brand-900 rounded-lg transition-colors">
                {editingPhaseId ? 'Uložit fázi' : 'Přidat fázi'}
              </button>
            </div>
          </form>
        )}

        <div className="space-y-2">
          {phases.map((phase) => (
            <div key={phase.id} className="flex items-start justify-between gap-3 border border-border rounded-lg p-3 group">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-foreground">{phase.title}</span>
                  <span className="text-[10px] text-muted-foreground">{PHASE_STATUS_LABELS[phase.status]}</span>
                </div>
                {phase.description && <p className="text-xs text-muted-foreground mt-0.5">{phase.description}</p>}
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <button onClick={() => openEditPhase(phase)} className="p-1 text-muted-foreground hover:text-foreground transition-colors">
                  <Pencil size={12} strokeWidth={1.5} />
                </button>
                <button onClick={() => handleDeletePhase(phase.id)} className="p-1 text-muted-foreground hover:text-red-500 transition-colors">
                  <Trash2 size={12} strokeWidth={1.5} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Export to real Byznys section */}
      {business.status === 'exportovano' && business.exported_startup_id ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-emerald-800 text-sm font-medium">
            <CheckCircle2 size={16} strokeWidth={1.5} />
            Exportováno do sekce Byznys
          </div>
          <Link
            href={`/hub/byznys/startup/${business.exported_startup_id}`}
            className="flex items-center gap-1.5 text-xs font-medium text-emerald-800 hover:text-emerald-900 transition-colors"
          >
            Otevřít startup projekt
            <ExternalLink size={12} strokeWidth={1.5} />
          </Link>
        </div>
      ) : (
        <div className="bg-white border border-border rounded-2xl p-6 space-y-3">
          <div className="flex items-center gap-2">
            <Rocket size={16} strokeWidth={1.5} className="text-brand-800" />
            <h2 className="text-base font-semibold text-foreground">Export do sekce Byznys</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Dostupné, jakmile je strategie ve statusu &quot;Připraveno k exportu&quot;. Vytvoří se reálný projekt v Byznys/Startup.
          </p>
          {business.status !== 'pripraveno_k_exportu' ? (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Nejdřív nastav status strategie na &quot;Připraveno k exportu&quot; výše.
            </p>
          ) : showExport ? (
            <div className="bg-muted/30 border border-border rounded-xl p-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Segment (pro startup projekt)</label>
                <input
                  type="text"
                  value={segment}
                  onChange={(e) => setSegment(e.target.value)}
                  placeholder="např. B2B SaaS, freelanceři..."
                  autoFocus
                  className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                />
              </div>
              <p className="text-[10px] text-muted-foreground">
                Název: <span className="font-medium">{business.title}</span> · Problém se předvyplní z pole &quot;Cíle&quot;.
              </p>
              {exportError && (
                <div className="flex items-center gap-2 text-red-600 text-xs">
                  <AlertCircle size={12} strokeWidth={2} />
                  {exportError}
                </div>
              )}
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowExport(false)} className="flex-1 py-2 text-sm text-muted-foreground border border-border rounded-lg hover:bg-muted transition-colors">
                  Zrušit
                </button>
                <button
                  onClick={handleExport}
                  disabled={isExporting}
                  className="flex-1 py-2 text-sm font-medium text-white bg-brand-800 hover:bg-brand-900 rounded-lg transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {isExporting && <Loader2 size={14} className="animate-spin" />}
                  Exportovat
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowExport(true)}
              className="flex items-center gap-1.5 text-xs font-medium text-white bg-brand-800 hover:bg-brand-900 rounded-lg px-3 py-2 transition-colors"
            >
              <Rocket size={13} strokeWidth={1.5} />
              Exportovat do sekce Byznys
            </button>
          )}
        </div>
      )}
    </div>
  )
}
