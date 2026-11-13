'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from '@/components/ui/toast'
import { Badge, badgeVariants } from '@/components/ui/badge'
import { CHANGE_TYPE_TONE, IMPROVEMENT_STATUS_TONE, STARTUP_PHASE_TONE, toneVariant } from '@/lib/admin-status'
import { cn } from '@/lib/utils'
import {
  ChevronDown, ChevronUp, Loader2, Archive, Trash2,
  ExternalLink, Save, Info, BookOpen, Lightbulb,
  StickyNote, Link2, Rocket, TrendingUp, Github, Code,
  Plus, Trash2 as TrashIcon, Pencil, Check, X, ArrowRight,
} from 'lucide-react'
import {
  STARTUP_PHASES, STARTUP_SEGMENTS, STARTUP_CURRENCIES,
  IMPROVEMENT_STATUS_LABELS,
  CHANGE_TYPE_LABELS,
  type PersonalProject,
  type PersonalProjectImprovement,
  type PersonalProjectChangelogEntry,
  type StartupPhase,
  type ImprovementStatus,
  type ChangeType,
} from '@/lib/types'
import {
  updatePersonalProject,
  archivePersonalProject,
  deletePersonalProject,
  publishToStartup,
  addPersonalImprovement,
  updatePersonalImprovement,
  deletePersonalImprovement,
  addPersonalChangelogEntry,
  deletePersonalChangelogEntry,
} from '@/app/dashboard/projekty/projekty-actions'

function numOrNull(v: string): number | null {
  const n = parseFloat(v.replace(',', '.'))
  return isNaN(n) ? null : n
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({
  title, icon, open, onToggle, children,
}: {
  title: string
  icon: React.ReactNode
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div className="bg-surface border border-navy-100 rounded-box overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <span className="text-quiet">{icon}</span>
          <span className="font-medium text-ink text-sm">{title}</span>
        </div>
        {open
          ? <ChevronUp size={15} strokeWidth={1.5} className="text-quiet" />
          : <ChevronDown size={15} strokeWidth={1.5} className="text-quiet" />
        }
      </button>
      {open && (
        <div className="px-5 pb-5 border-t border-navy-100 pt-4 space-y-4">
          {children}
        </div>
      )}
    </div>
  )
}

const inputCls = 'w-full px-3.5 py-2.5 text-sm border border-navy-100 rounded-chip bg-background text-ink placeholder:text-quiet focus:outline-none focus:ring-2 focus:ring-navy-500/30 focus:border-navy-500 transition-colors'
const textareaCls = `${inputCls} resize-none`
const labelCls = 'block text-sm font-medium text-ink mb-1.5'

// ─── Improvements ─────────────────────────────────────────────────────────────

const STATUS_ORDER: ImprovementStatus[] = ['idea', 'in_progress', 'done']

function PersonalImprovements({
  projectId,
  initialItems,
}: {
  projectId: string
  initialItems: PersonalProjectImprovement[]
}) {
  const [items, setItems] = useState(initialItems)
  const [newText, setNewText] = useState('')
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [loadingId, setLoadingId] = useState<string | null>(null)

  const handleAdd = async () => {
    if (!newText.trim()) return
    setAdding(true)
    const result = await addPersonalImprovement(projectId, newText)
    setAdding(false)
    if (result.error) { toast.error(result.error); return }
    if (result.item) setItems(prev => [...prev, result.item!])
    setNewText('')
  }

  const handleCycleStatus = async (item: PersonalProjectImprovement) => {
    const idx = STATUS_ORDER.indexOf(item.status)
    const newStatus = STATUS_ORDER[(idx + 1) % STATUS_ORDER.length]
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: newStatus } : i))
    const result = await updatePersonalImprovement(item.id, projectId, { status: newStatus })
    if (result.error) {
      toast.error(result.error)
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: item.status } : i))
    }
  }

  const handleSaveEdit = async (id: string) => {
    if (!editText.trim()) return
    setItems(prev => prev.map(i => i.id === id ? { ...i, content: editText.trim() } : i))
    const result = await updatePersonalImprovement(id, projectId, { content: editText.trim() })
    if (result.error) toast.error(result.error)
    setEditingId(null)
  }

  const handleDelete = async (id: string) => {
    setLoadingId(id)
    const result = await deletePersonalImprovement(id, projectId)
    setLoadingId(null)
    if (result.error) { toast.error(result.error); return }
    setItems(prev => prev.filter(i => i.id !== id))
  }

  const counts = {
    idea: items.filter(i => i.status === 'idea').length,
    in_progress: items.filter(i => i.status === 'in_progress').length,
    done: items.filter(i => i.status === 'done').length,
  }

  return (
    <div className="space-y-3">
      {items.length > 0 && (
        <div className="flex items-center gap-3 text-xs text-quiet">
          <span>{counts.idea} nápadů</span>
          <span className="text-navy-200">·</span>
          <span>{counts.in_progress} v řešení</span>
          <span className="text-navy-200">·</span>
          <span className="text-ink">{counts.done} hotovo</span>
        </div>
      )}
      <div className="space-y-2">
        {items.map(item => (
          <div key={item.id} className="flex items-start gap-3 py-2.5 px-3.5 bg-muted/30 rounded-chip group">
            <button
              type="button"
              onClick={() => handleCycleStatus(item)}
              className={cn('mt-0.5 shrink-0 cursor-pointer transition-opacity hover:opacity-80', badgeVariants({ variant: toneVariant(IMPROVEMENT_STATUS_TONE[item.status]) }))}
            >
              {IMPROVEMENT_STATUS_LABELS[item.status]}
            </button>
            {editingId === item.id ? (
              <div className="flex items-center gap-2 flex-1">
                <input
                  type="text"
                  value={editText}
                  onChange={e => setEditText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(item.id); if (e.key === 'Escape') setEditingId(null) }}
                  autoFocus
                  className="flex-1 px-2.5 py-1.5 text-sm border border-navy-400 rounded-chip bg-surface focus:outline-none"
                />
                <button type="button" onClick={() => handleSaveEdit(item.id)} className="rounded-chip p-1 text-navy-700 hover:bg-navy-50">
                  <Check size={14} strokeWidth={1.5} />
                </button>
                <button type="button" onClick={() => setEditingId(null)} className="p-1 text-quiet hover:bg-muted rounded">
                  <X size={14} strokeWidth={1.5} />
                </button>
              </div>
            ) : (
              <span className={`flex-1 text-sm leading-relaxed ${item.status === 'done' ? 'text-quiet line-through' : 'text-ink'}`}>
                {item.content}
              </span>
            )}
            {editingId !== item.id && (
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <button type="button" onClick={() => { setEditingId(item.id); setEditText(item.content) }} className="p-1.5 text-quiet hover:text-ink hover:bg-muted rounded-chip transition-colors">
                  <Pencil size={12} strokeWidth={1.5} />
                </button>
                <button type="button" onClick={() => handleDelete(item.id)} disabled={loadingId === item.id} className="p-1.5 text-quiet hover:text-danger hover:bg-danger/5 rounded-chip transition-colors">
                  <TrashIcon size={12} strokeWidth={1.5} />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 mt-2">
        <input
          type="text"
          value={newText}
          onChange={e => setNewText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
          placeholder="Přidat nápad na zlepšení…"
          className="flex-1 px-3.5 py-2 text-sm border border-navy-100 rounded-chip bg-background text-ink placeholder:text-quiet focus:outline-none focus:ring-2 focus:ring-navy-500/30 focus:border-navy-500 transition-colors"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={adding || !newText.trim()}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-navy-600 text-white text-sm font-medium rounded-chip hover:bg-navy-700 disabled:opacity-40 transition-colors"
        >
          <Plus size={14} strokeWidth={1.5} />
          Přidat
        </button>
      </div>
    </div>
  )
}

// ─── Changelog ────────────────────────────────────────────────────────────────

const CHANGE_TYPES = Object.entries(CHANGE_TYPE_LABELS) as [ChangeType, string][]

function PersonalChangelog({
  projectId,
  initialEntries,
}: {
  projectId: string
  initialEntries: PersonalProjectChangelogEntry[]
}) {
  const [entries, setEntries] = useState(initialEntries)
  const [showForm, setShowForm] = useState(false)
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [type, setType] = useState<ChangeType>('development')
  const [description, setDescription] = useState('')
  const [progressFrom, setProgressFrom] = useState('')
  const [progressTo, setProgressTo] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const progressDiff = progressFrom && progressTo
    ? parseInt(progressTo) - parseInt(progressFrom)
    : null

  const handleAdd = async () => {
    if (!description.trim()) { toast.error('Popis změny je povinný'); return }
    setSubmitting(true)
    const result = await addPersonalChangelogEntry(projectId, {
      change_date: date,
      change_type: type,
      description: description.trim(),
      progress_from: progressFrom ? parseInt(progressFrom) : null,
      progress_to: progressTo ? parseInt(progressTo) : null,
    })
    setSubmitting(false)
    if (result.error) { toast.error(result.error); return }
    if (result.entry) setEntries(prev => [result.entry!, ...prev])
    setDescription('')
    setProgressFrom('')
    setProgressTo('')
    setShowForm(false)
    toast.success('Změna zaznamenána')
  }

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    const result = await deletePersonalChangelogEntry(id, projectId)
    setDeletingId(null)
    if (result.error) { toast.error(result.error); return }
    setEntries(prev => prev.filter(e => e.id !== id))
  }

  return (
    <div className="space-y-4">
      {!showForm ? (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-navy-600 bg-navy-50 hover:bg-navy-100 border border-navy-200 rounded-chip transition-colors"
        >
          <Plus size={14} strokeWidth={1.5} />
          Zaznamenat změnu
        </button>
      ) : (
        <div className="bg-muted/30 border border-navy-100 rounded-chip p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-ink">Nový záznam</span>
            <button type="button" onClick={() => setShowForm(false)} className="text-quiet hover:text-ink text-xs">Zrušit</button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-quiet mb-1">Datum</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full px-3 py-2 text-sm border border-navy-100 rounded-chip bg-background text-ink focus:outline-none focus:ring-2 focus:ring-navy-500/30 focus:border-navy-500 transition-colors" />
            </div>
            <div>
              <label className="block text-xs font-medium text-quiet mb-1">Typ změny</label>
              <select value={type} onChange={e => setType(e.target.value as ChangeType)} className="w-full px-3 py-2 text-sm border border-navy-100 rounded-chip bg-background text-ink focus:outline-none focus:ring-2 focus:ring-navy-500/30 focus:border-navy-500 transition-colors">
                {CHANGE_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-quiet mb-1">Popis změny</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="Co konkrétně bylo uděláno?" className="w-full px-3 py-2 text-sm border border-navy-100 rounded-chip bg-background text-ink placeholder:text-quiet focus:outline-none focus:ring-2 focus:ring-navy-500/30 focus:border-navy-500 transition-colors resize-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-quiet mb-1">Posun v postupu projektu (volitelné)</label>
            <div className="flex items-center gap-2">
              <input type="number" value={progressFrom} onChange={e => setProgressFrom(e.target.value)} placeholder="Bylo %" min={0} max={100} className="w-24 px-3 py-2 text-sm border border-navy-100 rounded-chip bg-background text-ink focus:outline-none focus:ring-2 focus:ring-navy-500/30 focus:border-navy-500 transition-colors" />
              <ArrowRight size={14} strokeWidth={1.5} className="text-quiet shrink-0" />
              <input type="number" value={progressTo} onChange={e => setProgressTo(e.target.value)} placeholder="Nyní %" min={0} max={100} className="w-24 px-3 py-2 text-sm border border-navy-100 rounded-chip bg-background text-ink focus:outline-none focus:ring-2 focus:ring-navy-500/30 focus:border-navy-500 transition-colors" />
              {progressDiff !== null && (
                <span className={`text-sm font-semibold ${progressDiff === 0 ? 'text-quiet' : 'text-ink'}`}>
                  {progressDiff > 0 ? '+' : ''}{progressDiff} %
                </span>
              )}
            </div>
          </div>
          <button type="button" onClick={handleAdd} disabled={submitting || !description.trim()} className="w-full py-2.5 bg-navy-600 text-white text-sm font-medium rounded-chip hover:bg-navy-700 disabled:opacity-40 transition-colors">
            {submitting ? 'Ukládá se…' : 'Uložit záznam'}
          </button>
        </div>
      )}

      {entries.length === 0 ? (
        <p className="text-sm text-quiet py-3">Zatím žádné záznamy. Začni dokumentovat změny projektu.</p>
      ) : (
        <div className="relative">
          <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />
          <div className="space-y-4 pl-6">
            {entries.map(entry => {
              const diff = entry.progress_from !== null && entry.progress_to !== null
                ? entry.progress_to - entry.progress_from
                : null
              return (
                <div key={entry.id} className="relative group">
                  <div className="absolute -left-6 top-2 w-3.5 h-3.5 rounded-full border-2 border-white bg-navy-400 shadow-sm" />
                  <div className="bg-surface border border-navy-100 rounded-chip p-3.5 shadow-sm">
                    <div className="flex items-start justify-between mb-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={badgeVariants({ variant: toneVariant(CHANGE_TYPE_TONE[entry.change_type as ChangeType]) })}>
                          {CHANGE_TYPE_LABELS[entry.change_type as ChangeType] ?? entry.change_type}
                        </span>
                        <span className="text-xs text-quiet">
                          {new Date(entry.change_date).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </span>
                        {diff !== null && (
                          <span className={`text-xs font-semibold ${diff === 0 ? 'text-quiet' : 'text-ink'}`}>
                            {entry.progress_from} % → {entry.progress_to} %
                            {' '}<span className="text-quiet font-normal">({diff > 0 ? '+' : ''}{diff} %)</span>
                          </span>
                        )}
                      </div>
                      <button type="button" onClick={() => handleDelete(entry.id)} disabled={deletingId === entry.id} className="p-1 text-quiet hover:text-danger hover:bg-danger/5 rounded-chip transition-colors opacity-0 group-hover:opacity-100 shrink-0 ml-2">
                        <TrashIcon size={12} strokeWidth={1.5} />
                      </button>
                    </div>
                    <p className="text-sm text-ink leading-relaxed">{entry.description}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Editor ─────────────────────────────────────────────────────────────

type SectionId = 'basic' | 'description' | 'tech' | 'phase' | 'notes' | 'url' | 'improvements' | 'changelog'

interface Props {
  project: PersonalProject
  improvements: PersonalProjectImprovement[]
  changelog: PersonalProjectChangelogEntry[]
}

export function PersonalProjectEditor({ project, improvements, changelog }: Props) {
  const router = useRouter()

  const [name, setName] = useState(project.name)
  const [segmentSelect, setSegmentSelect] = useState(
    STARTUP_SEGMENTS.includes(project.segment) ? project.segment : '__custom__'
  )
  const [customSegment, setCustomSegment] = useState(
    STARTUP_SEGMENTS.includes(project.segment) ? '' : project.segment
  )
  const [problem, setProblem] = useState(project.problem)
  const [description, setDescription] = useState(project.description ?? '')
  const [monetization, setMonetization] = useState(project.monetization)
  const [techStack, setTechStack] = useState(project.tech_stack ?? '')
  const [githubUrl, setGithubUrl] = useState(project.github_url ?? '')
  const [liveUrl, setLiveUrl] = useState(project.live_url ?? '')
  const [phase, setPhase] = useState<StartupPhase>(project.phase)
  const [progress, setProgress] = useState(project.progress)
  const [currency, setCurrency] = useState(project.currency)
  const [plannedInvestment, setPlannedInvestment] = useState(project.planned_investment?.toString() ?? '')
  const [notes, setNotes] = useState(project.notes ?? '')

  const [open, setOpen] = useState<Set<SectionId>>(new Set<SectionId>(['basic', 'phase', 'changelog']))
  const [saving, setSaving] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const toggle = (s: SectionId) =>
    setOpen(prev => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n })

  const effectiveSegment = segmentSelect === '__custom__' ? customSegment : segmentSelect

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Název projektu je povinný'); return }
    if (!effectiveSegment.trim()) { toast.error('Segment je povinný'); return }
    if (!problem.trim()) { toast.error('Popis problému je povinný'); return }

    setSaving(true)
    const result = await updatePersonalProject(project.id, {
      name: name.trim(),
      segment: effectiveSegment.trim(),
      problem: problem.trim(),
      description: description.trim() || null,
      tech_stack: techStack.trim() || null,
      github_url: githubUrl.trim() || null,
      live_url: liveUrl.trim() || null,
      monetization,
      phase,
      progress,
      currency,
      planned_investment: numOrNull(plannedInvestment),
      notes: notes.trim() || null,
    })
    setSaving(false)
    if (result.error) toast.error(result.error)
    else toast.success('Projekt uložen')
  }

  const handleArchive = async () => {
    setArchiving(true)
    await archivePersonalProject(project.id)
  }

  const handleDelete = async () => {
    setDeleting(true)
    await deletePersonalProject(project.id)
  }

  const handlePublish = async () => {
    setPublishing(true)
    const result = await publishToStartup(project.id)
    setPublishing(false)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('Projekt přesunut do Startup sekce!')
      router.push(`/dashboard/startup/${result.startupId}`)
    }
  }

  const currentPhase = STARTUP_PHASES.find(p => p.value === phase) ?? STARTUP_PHASES[0]

  return (
    <div className="space-y-3">
      {/* Publish to Startup CTA */}
      <div className="flex items-center justify-between py-4 px-5 bg-navy-50 border border-navy-100 rounded-box">
        <div>
          <p className="text-sm font-medium text-ink">Hotov na spuštění?</p>
          <p className="text-xs text-quiet mt-0.5">Přesuň projekt do Startup sekce — přenese se celý obsah včetně changelogu a nápadů.</p>
        </div>
        <button
          type="button"
          onClick={handlePublish}
          disabled={publishing}
          className="inline-flex items-center gap-2 px-4 py-2 bg-navy-700 text-white text-sm font-medium rounded-chip hover:bg-navy-800 disabled:opacity-50 transition-all shadow-sm shrink-0 ml-4"
        >
          {publishing
            ? <Loader2 size={13} strokeWidth={1.5} className="animate-spin" />
            : <Rocket size={13} strokeWidth={1.5} />
          }
          {publishing ? 'Přesunuje se…' : 'Zveřejnit na Startup'}
        </button>
      </div>

      {/* Sticky save bar */}
      <div className="flex items-center justify-between py-3 px-5 bg-surface border border-navy-100 rounded-box">
        <div className="flex items-center gap-2.5">
          <Badge variant={toneVariant(STARTUP_PHASE_TONE[currentPhase.value])}>{currentPhase.label}</Badge>
          <div className="flex items-center gap-1.5 text-sm text-quiet">
            <span className="tabular-nums font-medium text-ink">{progress} %</span>
            <span>hotovo</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!confirmDelete ? (
            <>
              <button type="button" onClick={() => setConfirmDelete(true)} className="p-2 text-quiet hover:text-danger hover:bg-danger/5 rounded-chip transition-colors" title="Smazat projekt">
                <Trash2 size={15} strokeWidth={1.5} />
              </button>
              <button type="button" onClick={handleArchive} disabled={archiving} className="rounded-chip p-2 text-quiet transition-colors hover:bg-navy-50 hover:text-ink" title="Archivovat projekt">
                {archiving ? <Loader2 size={15} strokeWidth={1.5} className="animate-spin" /> : <Archive size={15} strokeWidth={1.5} />}
              </button>
              <button type="button" onClick={handleSave} disabled={saving} className="inline-flex items-center gap-1.5 px-4 py-2 bg-navy-600 text-white text-sm font-medium rounded-chip hover:bg-navy-700 disabled:opacity-50 transition-colors shadow-sm">
                {saving ? <Loader2 size={13} strokeWidth={1.5} className="animate-spin" /> : <Save size={13} strokeWidth={1.5} />}
                {saving ? 'Ukládá se…' : 'Uložit'}
              </button>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm text-danger font-medium">Opravdu smazat?</span>
              <button type="button" onClick={handleDelete} disabled={deleting} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-danger text-white text-sm font-medium rounded-chip hover:bg-danger disabled:opacity-50 transition-colors">
                {deleting && <Loader2 size={12} strokeWidth={1.5} className="animate-spin" />}
                Smazat
              </button>
              <button type="button" onClick={() => setConfirmDelete(false)} className="px-3 py-1.5 text-sm text-quiet hover:text-ink transition-colors">Zrušit</button>
            </div>
          )}
        </div>
      </div>

      {/* ── SECTION: Základní informace ── */}
      <Section title="Základní informace" icon={<Info size={15} strokeWidth={1.5} />} open={open.has('basic')} onToggle={() => toggle('basic')}>
        <div>
          <label className={labelCls}>Název projektu <span className="text-danger">*</span></label>
          <input type="text" value={name} onChange={e => setName(e.target.value)} className={inputCls} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Segment / Kategorie <span className="text-danger">*</span></label>
            <select value={segmentSelect} onChange={e => setSegmentSelect(e.target.value)} className={inputCls}>
              {STARTUP_SEGMENTS.map(s => <option key={s} value={s}>{s}</option>)}
              <option value="__custom__">Vlastní...</option>
            </select>
            {segmentSelect === '__custom__' && (
              <input type="text" value={customSegment} onChange={e => setCustomSegment(e.target.value)} placeholder="Vlastní kategorie" className={`${inputCls} mt-2`} />
            )}
          </div>
          <div className="flex flex-col justify-center">
            <label className={labelCls}>Monetizace</label>
            <div className="flex items-center justify-between px-3.5 py-2.5 bg-muted/40 rounded-chip">
              <span className="text-sm text-ink">{monetization ? 'Ano' : 'Ne'}</span>
              <button type="button" onClick={() => setMonetization(v => !v)} className={`relative w-10 h-5 rounded-full transition-colors ${monetization ? 'bg-navy-600' : 'bg-navy-200'}`}>
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-surface rounded-full shadow transition-transform ${monetization ? 'translate-x-5' : ''}`} />
              </button>
            </div>
          </div>
        </div>
        <div>
          <label className={labelCls}>Problém, který projekt řeší <span className="text-danger">*</span></label>
          <textarea value={problem} onChange={e => setProblem(e.target.value)} rows={4} placeholder="Popiš konkrétní problém nebo potřebu…" className={textareaCls} />
        </div>
      </Section>

      {/* ── SECTION: Popis projektu ── */}
      <Section title="Popis projektu" icon={<BookOpen size={15} strokeWidth={1.5} />} open={open.has('description')} onToggle={() => toggle('description')}>
        <div>
          <label className={labelCls}>Stručný popis projektu</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={5} placeholder="Popiš projekt podrobněji — co dělá, pro koho je určen, jaký má cíl…" className={textareaCls} />
        </div>
      </Section>

      {/* ── SECTION: Tech stack & Repozitář ── */}
      <Section title="Tech stack & Repozitář" icon={<Code size={15} strokeWidth={1.5} />} open={open.has('tech')} onToggle={() => toggle('tech')}>
        <div>
          <label className={labelCls}>Tech stack</label>
          <input type="text" value={techStack} onChange={e => setTechStack(e.target.value)} placeholder="např. Next.js, Supabase, Tailwind, TypeScript" className={inputCls} />
          <p className="text-xs text-quiet mt-1.5">Technologie, knihovny a nástroje použité v projektu</p>
        </div>
        <div>
          <label className={labelCls}>GitHub repozitář</label>
          <div className="flex items-center gap-2">
            <Github size={16} strokeWidth={1.5} className="text-quiet shrink-0" />
            <input type="url" value={githubUrl} onChange={e => setGithubUrl(e.target.value)} placeholder="https://github.com/username/repo" className={`${inputCls} flex-1`} />
          </div>
          {githubUrl && (
            <a href={githubUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 mt-2 text-sm text-navy-600 hover:text-navy-700 transition-colors">
              <ExternalLink size={13} strokeWidth={1.5} />
              Otevřít GitHub
            </a>
          )}
        </div>
        <div>
          <label className={labelCls}>Live URL projektu</label>
          <input type="url" value={liveUrl} onChange={e => setLiveUrl(e.target.value)} placeholder="https://mujprojekt.cz" className={inputCls} />
          {liveUrl && (
            <a href={liveUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 mt-2 text-sm text-navy-600 hover:text-navy-700 transition-colors">
              <ExternalLink size={13} strokeWidth={1.5} />
              Otevřít projekt
            </a>
          )}
        </div>
        <div>
          <label className={labelCls}>Plánovaná investice ({currency})</label>
          <div className="flex items-center gap-2">
            <input type="number" value={plannedInvestment} onChange={e => setPlannedInvestment(e.target.value)} placeholder="0" min={0} className={`${inputCls} flex-1`} />
            <select value={currency} onChange={e => setCurrency(e.target.value)} className="px-3 py-2.5 text-sm border border-navy-100 rounded-chip bg-background text-ink focus:outline-none focus:ring-2 focus:ring-navy-500/30 focus:border-navy-500 transition-colors">
              {STARTUP_CURRENCIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
        </div>
      </Section>

      {/* ── SECTION: Fáze projektu ── */}
      <Section title="Fáze projektu" icon={<Rocket size={15} strokeWidth={1.5} />} open={open.has('phase')} onToggle={() => toggle('phase')}>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {STARTUP_PHASES.map(p => (
            <button
              key={p.value}
              type="button"
              onClick={() => setPhase(p.value)}
              aria-pressed={phase === p.value}
              className={`rounded-chip border px-3 py-2.5 text-left text-xs font-medium transition-colors ${
                phase === p.value
                  ? 'border-navy-700 bg-navy-700 text-white'
                  : 'border-navy-100 text-quiet hover:border-navy-300 hover:text-ink'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-ink">Celkový postup projektu</label>
            <span className="text-sm font-semibold text-navy-700 tabular-nums">{progress} %</span>
          </div>
          <input type="range" min={0} max={100} value={progress} onChange={e => setProgress(Number(e.target.value))} className="w-full accent-navy-600" />
          <div className="mt-1.5 h-2 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-navy-700 rounded-full transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </Section>

      {/* ── SECTION: Osobní poznámky ── */}
      <Section title="Osobní poznámky" icon={<StickyNote size={15} strokeWidth={1.5} />} open={open.has('notes')} onToggle={() => toggle('notes')}>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={5} placeholder="Soukromé poznámky, myšlenky, nápady k projektu…" className={textareaCls} />
      </Section>

      {/* ── SECTION: Nápady na zlepšení ── */}
      <Section title="Nápady na zlepšení" icon={<TrendingUp size={15} strokeWidth={1.5} />} open={open.has('improvements')} onToggle={() => toggle('improvements')}>
        <PersonalImprovements projectId={project.id} initialItems={improvements} />
      </Section>

      {/* ── SECTION: Changelog ── */}
      <Section title="Changelog / Audit log" icon={<Lightbulb size={15} strokeWidth={1.5} />} open={open.has('changelog')} onToggle={() => toggle('changelog')}>
        <PersonalChangelog projectId={project.id} initialEntries={changelog} />
      </Section>

      {/* Bottom save */}
      <div className="flex justify-end pb-4">
        <button type="button" onClick={handleSave} disabled={saving} className="inline-flex items-center gap-2 px-5 py-2.5 bg-navy-600 text-white text-sm font-medium rounded-chip hover:bg-navy-700 disabled:opacity-50 transition-colors shadow-sm">
          {saving ? <Loader2 size={14} strokeWidth={1.5} className="animate-spin" /> : <Save size={14} strokeWidth={1.5} />}
          {saving ? 'Ukládá se…' : 'Uložit projekt'}
        </button>
      </div>
    </div>
  )
}
