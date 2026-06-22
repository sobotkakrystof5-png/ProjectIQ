'use client'

import { useState, useTransition } from 'react'
import {
  GraduationCap, Calendar, BookOpen, BarChart2,
  Plus, Trash2, CheckSquare, Square,
  AlertCircle, Clock, ChevronDown, ChevronUp, X, Calculator,
} from 'lucide-react'
import {
  SUBJECTS, SubjectStats, DeadlineEntry, GradeEntry, SportCategory,
  simulateGesamtdurchschnitt,
} from './subjects'
import { toggleDeadline, deleteDeadline, deleteGrade } from './actions'
import { AddGradeModal } from './AddGradeModal'
import { AddDeadlineModal } from './AddDeadlineModal'

// ── Helpers ───────────────────────────────────────────────────────────────────

const GRADE_LABELS: Record<number, string> = {
  1: 'Sehr gut', 2: 'Gut', 3: 'Befriedigend',
  4: 'Ausreichend', 5: 'Mangelhaft', 6: 'Ungenügend',
}

const DEADLINE_LABELS = {
  klassenarbeit: 'KA', homework: 'Úkol', presentation: 'Referát', other: 'Jiné',
}

const DEADLINE_COLORS = {
  klassenarbeit: 'bg-red-50 text-red-700 border-red-200',
  homework:      'bg-blue-50 text-blue-700 border-blue-200',
  presentation:  'bg-violet-50 text-violet-700 border-violet-200',
  other:         'bg-slate-50 text-slate-600 border-slate-200',
}

function gradeChipCls(g: number) {
  if (g <= 1) return 'bg-emerald-100 text-emerald-800 border-emerald-300'
  if (g <= 2) return 'bg-teal-100 text-teal-800 border-teal-300'
  if (g <= 3) return 'bg-amber-100 text-amber-800 border-amber-300'
  if (g <= 4) return 'bg-orange-100 text-orange-800 border-orange-300'
  return 'bg-red-100 text-red-800 border-red-300'
}

function avgBadgeCls(g: number) {
  if (g <= 1.5) return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (g <= 2.5) return 'bg-teal-50 text-teal-700 border-teal-200'
  if (g <= 3.5) return 'bg-amber-50 text-amber-700 border-amber-200'
  if (g <= 4.5) return 'bg-orange-50 text-orange-700 border-orange-200'
  return 'bg-red-50 text-red-700 border-red-200'
}

function formatDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

function getDueDiff(iso: string) {
  const d = new Date(iso + 'T00:00:00')
  const now = new Date(); now.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - now.getTime()) / 86400000)
}

// ── Root component ────────────────────────────────────────────────────────────

type Props = {
  grades: GradeEntry[]
  deadlines: DeadlineEntry[]
  subjectStats: SubjectStats[]
  gesamtdurchschnitt: number | null
}

type Tab = 'terminy' | 'znamky' | 'prumer'

export function SchoolClient({ deadlines, subjectStats, gesamtdurchschnitt }: Props) {
  const [tab, setTab] = useState<Tab>('terminy')
  const [addGradeSubject, setAddGradeSubject] = useState<string | null>(null)
  const [showAddDeadline, setShowAddDeadline] = useState(false)

  const overdueCount = deadlines.filter(d => !d.done && getDueDiff(d.dueDate) < 0).length

  const tabs: { id: Tab; label: string; Icon: typeof Calendar }[] = [
    { id: 'terminy', label: 'Termíny', Icon: Calendar },
    { id: 'znamky', label: 'Známky', Icon: BookOpen },
    { id: 'prumer', label: 'Průměr', Icon: BarChart2 },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 bg-gradient-to-br from-violet-600 to-purple-700 rounded-xl flex items-center justify-center shadow-sm shrink-0 mt-0.5">
          <GraduationCap size={20} strokeWidth={1.5} className="text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">Škola</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Klasse 9 · Sächsisches Gymnasium</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
        {tabs.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === id ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon size={15} strokeWidth={1.5} />
            <span className="hidden sm:inline">{label}</span>
            {id === 'terminy' && overdueCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center font-bold">
                {overdueCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === 'terminy' && (
        <TermínySection deadlines={deadlines} onAdd={() => setShowAddDeadline(true)} />
      )}
      {tab === 'znamky' && (
        <ZnámkySection subjectStats={subjectStats} onAddGrade={setAddGradeSubject} />
      )}
      {tab === 'prumer' && (
        <PrůměrSection subjectStats={subjectStats} gesamtdurchschnitt={gesamtdurchschnitt} />
      )}

      {/* Modals */}
      {showAddDeadline && <AddDeadlineModal onClose={() => setShowAddDeadline(false)} />}
      {addGradeSubject && (
        <AddGradeModal initialSubject={addGradeSubject} onClose={() => setAddGradeSubject(null)} />
      )}
    </div>
  )
}

// ── Termíny section ───────────────────────────────────────────────────────────

function TermínySection({ deadlines, onAdd }: { deadlines: DeadlineEntry[]; onAdd: () => void }) {
  const [showDone, setShowDone] = useState(false)

  const overdue  = deadlines.filter(d => !d.done && getDueDiff(d.dueDate) < 0)
  const upcoming = deadlines.filter(d => !d.done && getDueDiff(d.dueDate) >= 0)
  const done     = deadlines.filter(d => d.done)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">Termíny a úkoly</h2>
        <button
          onClick={onAdd}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-border bg-white hover:bg-slate-50 transition-colors"
        >
          <Plus size={13} strokeWidth={1.5} /> Přidat
        </button>
      </div>

      {deadlines.length === 0 && (
        <div className="bg-violet-50 border border-violet-200 rounded-2xl p-8 text-center">
          <Calendar size={32} strokeWidth={1.5} className="text-violet-300 mx-auto mb-2" />
          <p className="text-sm text-violet-700">Žádné termíny. Klikni na + Přidat.</p>
        </div>
      )}

      {overdue.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-red-600 uppercase tracking-wide flex items-center gap-1">
            <AlertCircle size={12} strokeWidth={1.5} /> Po termínu
          </p>
          {overdue.map(d => <DeadlineRow key={d.id} deadline={d} isOverdue />)}
        </div>
      )}

      {upcoming.length > 0 && (
        <div className="space-y-2">
          {overdue.length > 0 && (
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <Clock size={12} strokeWidth={1.5} /> Nadcházející
            </p>
          )}
          {upcoming.map(d => <DeadlineRow key={d.id} deadline={d} />)}
        </div>
      )}

      {done.length > 0 && (
        <div>
          <button
            onClick={() => setShowDone(v => !v)}
            className="text-xs text-muted-foreground flex items-center gap-1 mb-2 hover:text-foreground transition-colors"
          >
            {showDone ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {done.length} splněno
          </button>
          {showDone && (
            <div className="space-y-2">
              {done.map(d => <DeadlineRow key={d.id} deadline={d} />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function DeadlineRow({ deadline, isOverdue = false }: { deadline: DeadlineEntry; isOverdue?: boolean }) {
  const [, startTransition] = useTransition()
  const diff = getDueDiff(deadline.dueDate)

  const diffLabel = deadline.done ? 'Splněno'
    : diff < 0  ? `${Math.abs(diff)}d po termínu`
    : diff === 0 ? 'Dnes!'
    : diff === 1 ? 'Zítra'
    : `za ${diff} dní`

  const diffCls = deadline.done ? 'text-muted-foreground'
    : diff < 0  ? 'text-red-600 font-semibold'
    : diff === 0 ? 'text-orange-600 font-semibold'
    : diff <= 3  ? 'text-amber-600'
    : 'text-muted-foreground'

  return (
    <div className={`bg-white border rounded-xl px-4 py-3 flex items-center gap-3 ${
      deadline.done ? 'opacity-60 border-border' : isOverdue ? 'border-red-200 bg-red-50/30' : 'border-border'
    }`}>
      <button
        onClick={() => startTransition(() => toggleDeadline(deadline.id, !deadline.done))}
        className="shrink-0 text-muted-foreground hover:text-violet-600 transition-colors"
      >
        {deadline.done
          ? <CheckSquare size={16} strokeWidth={1.5} />
          : <Square size={16} strokeWidth={1.5} />
        }
      </button>

      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${deadline.done ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
          {deadline.title}
        </p>
        {deadline.subject && (
          <p className="text-xs text-muted-foreground mt-0.5">{deadline.subject}</p>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${DEADLINE_COLORS[deadline.type]}`}>
          {DEADLINE_LABELS[deadline.type]}
        </span>
        <span className={`text-xs ${diffCls}`}>{diffLabel}</span>
        <span className="text-xs text-muted-foreground hidden sm:inline">{formatDate(deadline.dueDate)}</span>
        <button
          onClick={() => startTransition(() => deleteDeadline(deadline.id))}
          className="text-muted-foreground hover:text-red-500 transition-colors"
        >
          <Trash2 size={13} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  )
}

// ── Známky section ────────────────────────────────────────────────────────────

function ZnámkySection({ subjectStats, onAddGrade }: {
  subjectStats: SubjectStats[]
  onAddGrade: (subject: string) => void
}) {
  const hauptfaecher = subjectStats.filter(s => s.subject.hasKA)
  const nebenfaecher = subjectStats.filter(s => !s.subject.hasKA)

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Hauptfächer — KA + Sonstige
        </p>
        <div className="space-y-3">
          {hauptfaecher.map(s => (
            <SubjectCard key={s.subject.id} stats={s} onAddGrade={onAddGrade} />
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Nebenfächer — Sonstige
        </p>
        <div className="space-y-3">
          {nebenfaecher.map(s => (
            <SubjectCard key={s.subject.id} stats={s} onAddGrade={onAddGrade} />
          ))}
        </div>
      </div>
    </div>
  )
}

function SubjectCard({ stats, onAddGrade }: {
  stats: SubjectStats
  onAddGrade: (subject: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const { subject, kaGrades, sonstigeGrades, kaAvg, sonstigeAvg, finalAvg, zeugnisnote, sportCategories } = stats
  const totalGrades = kaGrades.length + sonstigeGrades.length

  return (
    <div className="bg-white border border-border rounded-2xl overflow-hidden">
      {/* Card header */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setExpanded(v => !v)}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label={expanded ? 'Skrýt' : 'Rozbalit'}
          >
            {expanded
              ? <ChevronUp size={15} strokeWidth={1.5} />
              : <ChevronDown size={15} strokeWidth={1.5} />
            }
          </button>
          <div>
            <p className="text-sm font-semibold text-foreground">{subject.label}</p>
            <p className="text-xs text-muted-foreground">
              {subject.isSport ? 'Sport' : subject.hasKA ? 'Hauptfach' : 'Nebenfach'}
              {totalGrades > 0 && ` · ${totalGrades} ${totalGrades === 1 ? 'známka' : 'známky'}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {finalAvg !== null && (
            <div className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${avgBadgeCls(finalAvg)}`}>
              Ø {finalAvg.toFixed(2)} → {zeugnisnote}
            </div>
          )}
          <button
            onClick={() => onAddGrade(subject.id)}
            className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-border hover:bg-slate-50 transition-colors text-muted-foreground"
          >
            <Plus size={12} strokeWidth={1.5} /> Přidat
          </button>
        </div>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="border-t border-border">
          {subject.isSport ? (
            <SportBody categories={sportCategories} allSonstige={sonstigeGrades} />
          ) : subject.hasKA ? (
            <>
              <div className="grid grid-cols-2 divide-x divide-border">
                <GradeColumn label="Klassenarbeit" grades={kaGrades} colAvg={kaAvg} />
                <GradeColumn label="Sonstige" grades={sonstigeGrades} colAvg={sonstigeAvg} />
              </div>
              {finalAvg !== null && (
                <div className="px-4 py-2 bg-slate-50 border-t border-border text-xs text-muted-foreground">
                  Ø KA {kaAvg?.toFixed(2) ?? '—'} + Ø Sonstige {sonstigeAvg?.toFixed(2) ?? '—'}{' '}
                  = Fachdurchschnitt{' '}
                  <span className="font-semibold text-foreground">{finalAvg.toFixed(2)}</span>{' '}
                  → Note:{' '}
                  <span className={`font-bold ${zeugnisnote && zeugnisnote <= 2 ? 'text-emerald-600' : zeugnisnote && zeugnisnote >= 5 ? 'text-red-600' : 'text-foreground'}`}>
                    {zeugnisnote}
                  </span>
                </div>
              )}
            </>
          ) : (
            <GradeColumn label="Sonstige Leistungen" grades={sonstigeGrades} colAvg={sonstigeAvg} fullWidth />
          )}
        </div>
      )}
    </div>
  )
}

function GradeColumn({ label, grades, colAvg, fullWidth = false }: {
  label: string
  grades: GradeEntry[]
  colAvg: number | null
  fullWidth?: boolean
}) {
  const [, startTransition] = useTransition()

  return (
    <div className={`px-4 py-3 ${fullWidth ? '' : ''}`}>
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">{label}</p>
      {grades.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">Zatím žádné</p>
      ) : (
        <div className="space-y-1.5">
          {grades.map(g => (
            <div key={g.id} className="flex items-center gap-2">
              <span
                className={`w-8 h-8 rounded-lg text-sm font-bold flex items-center justify-center border shrink-0 ${gradeChipCls(g.grade)}`}
                title={GRADE_LABELS[g.grade]}
              >
                {g.grade}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground truncate">
                  {g.note ?? (g.gradeType === 'klassenarbeit' ? 'Klassenarbeit' : 'Sonstige Leistung')}
                </p>
                <p className="text-[11px] text-muted-foreground">{formatDate(g.gradedAt)}</p>
              </div>
              <button
                onClick={() => startTransition(() => deleteGrade(g.id))}
                className="shrink-0 text-muted-foreground hover:text-red-500 transition-colors"
                title="Smazat"
              >
                <X size={13} strokeWidth={1.5} />
              </button>
            </div>
          ))}
        </div>
      )}
      {colAvg !== null && (
        <div className="mt-2 pt-2 border-t border-border">
          <p className="text-xs text-muted-foreground">
            Průměr:{' '}
            <span className={`font-bold px-1.5 py-0.5 rounded-md border text-xs ${avgBadgeCls(colAvg)}`}>
              {colAvg.toFixed(2)}
            </span>
          </p>
        </div>
      )}
    </div>
  )
}

function SportBody({ categories, allSonstige }: {
  categories: Record<string, SportCategory>
  allSonstige: GradeEntry[]
}) {
  const [, startTransition] = useTransition()

  if (Object.keys(categories).length === 0) {
    return (
      <div className="px-4 py-3 text-xs text-muted-foreground italic">
        Žádné hodnocení. Přidej přes tlačítko + Přidat a zadej název sportu.
      </div>
    )
  }

  return (
    <div className="divide-y divide-border">
      {Object.entries(categories).map(([cat, { grades, categoryAvg }]) => (
        <div key={cat} className="px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{cat}</p>
            {categoryAvg !== null && (
              <span className={`text-xs font-bold px-2 py-0.5 rounded-lg border ${avgBadgeCls(categoryAvg)}`}>
                Ø {categoryAvg.toFixed(2)}
              </span>
            )}
          </div>
          <div className="space-y-1.5">
            {grades.map(g => (
              <div key={g.id} className="flex items-center gap-2">
                <span className={`w-8 h-8 rounded-lg text-sm font-bold flex items-center justify-center border shrink-0 ${gradeChipCls(g.grade)}`}>
                  {g.grade}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">{g.note ?? cat}</p>
                  <p className="text-[11px] text-muted-foreground">{formatDate(g.gradedAt)}</p>
                </div>
                <button
                  onClick={() => startTransition(() => deleteGrade(g.id))}
                  className="shrink-0 text-muted-foreground hover:text-red-500 transition-colors"
                >
                  <X size={13} strokeWidth={1.5} />
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Průměr + Kalkulačka section ───────────────────────────────────────────────

function PrůměrSection({ subjectStats, gesamtdurchschnitt }: {
  subjectStats: SubjectStats[]
  gesamtdurchschnitt: number | null
}) {
  const [simSubject, setSimSubject] = useState(SUBJECTS[0].id)
  const [simNote, setSimNote] = useState(2)

  const simResult = simulateGesamtdurchschnitt(subjectStats, simSubject, simNote)
  const diff = gesamtdurchschnitt !== null && simResult !== null
    ? simResult - gesamtdurchschnitt
    : null

  const withAvg = subjectStats.filter(s => s.finalAvg !== null)
  const sorted = [...withAvg].sort((a, b) => (a.finalAvg ?? 0) - (b.finalAvg ?? 0))

  return (
    <div className="space-y-6">
      {/* Gesamtdurchschnitt card */}
      <div className={`rounded-2xl border p-6 text-center ${
        gesamtdurchschnitt !== null ? avgBadgeCls(gesamtdurchschnitt) : 'bg-slate-50 border-border text-muted-foreground'
      }`}>
        <p className="text-xs font-semibold uppercase tracking-widest mb-1 opacity-70">
          Gesamtdurchschnitt
        </p>
        {gesamtdurchschnitt !== null ? (
          <>
            <p className="text-5xl font-bold tracking-tight">{gesamtdurchschnitt.toFixed(2)}</p>
            <p className="text-sm mt-2 opacity-80">
              Zeugnisnote {Math.round(gesamtdurchschnitt)} · {withAvg.length}/{SUBJECTS.length} předmětů
            </p>
          </>
        ) : (
          <p className="text-sm py-2">Zatím žádné známky — začni v záložce Známky.</p>
        )}
      </div>

      {/* Per-subject table */}
      {sorted.length > 0 && (
        <div className="bg-white border border-border rounded-2xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border bg-slate-50">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Průměr dle předmětu
            </p>
          </div>
          <div className="divide-y divide-border">
            {sorted.map(s => (
              <div key={s.subject.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{s.subject.label}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {s.subject.isSport
                      ? `${Object.keys(s.sportCategories).length} sport${Object.keys(s.sportCategories).length !== 1 ? 'y' : ''}`
                      : s.subject.hasKA
                      ? `KA: ${s.kaGrades.length}× · Sonstige: ${s.sonstigeGrades.length}×`
                      : `Sonstige: ${s.sonstigeGrades.length}×`
                    }
                  </p>
                </div>
                <div className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${avgBadgeCls(s.finalAvg ?? 3)}`}>
                  Ø {(s.finalAvg ?? 0).toFixed(2)}
                </div>
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold border ${avgBadgeCls(s.zeugnisnote ?? 3)}`}>
                  {s.zeugnisnote}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Missing subjects notice */}
      {subjectStats.filter(s => s.finalAvg === null).length > 0 && (
        <p className="text-xs text-muted-foreground">
          Bez hodnocení:{' '}
          {subjectStats.filter(s => s.finalAvg === null).map(s => s.subject.label).join(', ')}
        </p>
      )}

      {/* Kalkulačka */}
      <div className="bg-white border border-border rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Calculator size={16} strokeWidth={1.5} className="text-violet-600" />
          <h3 className="text-sm font-semibold text-foreground">Kalkulačka — Co kdyby?</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Vyber předmět a Zeugnisnote — uvidíš jak by se změnil tvůj Gesamtdurchschnitt.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <select
            value={simSubject}
            onChange={e => setSimSubject(e.target.value)}
            className="flex-1 text-sm px-3 py-2 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white"
          >
            {SUBJECTS.map(s => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
          <div className="flex gap-1.5">
            {[1, 2, 3, 4, 5, 6].map(n => (
              <button
                key={n}
                onClick={() => setSimNote(n)}
                title={GRADE_LABELS[n]}
                className={`flex-1 sm:w-10 py-2 text-sm font-bold rounded-xl border-2 transition-all ${
                  simNote === n
                    ? gradeChipCls(n) + ' border-current scale-105 shadow-sm'
                    : 'border-border text-muted-foreground hover:border-slate-300'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {simResult !== null && (
          <div className={`rounded-xl border p-4 text-center ${avgBadgeCls(simResult)}`}>
            <p className="text-xs opacity-70 mb-1">
              Kdyby měl <strong>{simSubject}</strong> Zeugnisnote <strong>{simNote}</strong>:
            </p>
            <p className="text-3xl font-bold">{simResult.toFixed(2)}</p>
            {diff !== null && Math.abs(diff) > 0.001 && (
              <p className="text-xs mt-1 opacity-80">
                {diff > 0 ? '+' : ''}{diff.toFixed(2)} oproti současnému průměru
              </p>
            )}
            {diff === null && (
              <p className="text-xs mt-1 opacity-80">
                (zadej hodnocení do ostatních předmětů pro přesnější výsledek)
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
