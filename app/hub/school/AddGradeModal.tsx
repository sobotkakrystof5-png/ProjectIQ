'use client'

import { useState, useTransition } from 'react'
import { X } from 'lucide-react'
import { SUBJECTS } from './subjects'
import { addGrade } from './actions'

const GRADE_LABELS: Record<number, string> = {
  1: 'Sehr gut', 2: 'Gut', 3: 'Befriedigend',
  4: 'Ausreichend', 5: 'Mangelhaft', 6: 'Ungenügend',
}

const GRADE_COLORS: Record<number, string> = {
  1: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  2: 'border-teal-300 bg-teal-50 text-teal-800',
  3: 'border-amber-300 bg-amber-50 text-amber-800',
  4: 'border-orange-300 bg-orange-50 text-orange-800',
  5: 'border-red-300 bg-red-50 text-red-800',
  6: 'border-red-400 bg-red-100 text-red-900',
}

export function AddGradeModal({
  initialSubject,
  onClose,
}: {
  initialSubject: string
  onClose: () => void
}) {
  const subject = SUBJECTS.find(s => s.id === initialSubject) ?? SUBJECTS[0]

  const [gradeType, setGradeType] = useState<'klassenarbeit' | 'sonstige'>(
    subject.hasKA ? 'klassenarbeit' : 'sonstige'
  )
  const [grade, setGrade] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [sportCategory, setSportCategory] = useState('')
  const [gradedAt, setGradedAt] = useState(() => new Date().toISOString().slice(0, 10))
  const [pending, startTransition] = useTransition()

  function handleSubmit() {
    if (!grade) return
    startTransition(async () => {
      await addGrade({
        subject: initialSubject,
        gradeType,
        grade,
        note: note.trim() || null,
        sportCategory: subject.isSport ? (sportCategory.trim() || 'Allgemein') : null,
        gradedAt,
      })
      onClose()
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">
            Přidat známku · {subject.label}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>

        <div className="p-5 space-y-4">

          {/* Grade type — only for Hauptfächer */}
          {subject.hasKA && (
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-2">
                Typ
              </label>
              <div className="flex gap-2">
                {(['klassenarbeit', 'sonstige'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setGradeType(t)}
                    className={`flex-1 py-2 text-sm font-medium rounded-xl border transition-colors ${
                      gradeType === t
                        ? 'border-violet-500 bg-violet-50 text-violet-700'
                        : 'border-border text-muted-foreground hover:bg-slate-50'
                    }`}
                  >
                    {t === 'klassenarbeit' ? 'Klassenarbeit' : 'Sonstige'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Grade picker */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-2">
              Známka
            </label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5, 6].map(n => (
                <button
                  key={n}
                  onClick={() => setGrade(n)}
                  title={GRADE_LABELS[n]}
                  className={`flex-1 py-3 text-sm font-bold rounded-xl border-2 transition-all ${
                    grade === n
                      ? GRADE_COLORS[n] + ' ring-2 ring-offset-1 ring-violet-400 scale-105 shadow-sm'
                      : 'border-border text-muted-foreground hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            {grade && (
              <p className="text-xs text-muted-foreground mt-1.5 text-center">{GRADE_LABELS[grade]}</p>
            )}
          </div>

          {/* Sport category */}
          {subject.isSport && (
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-2">
                Sportart / Kategorie
              </label>
              <input
                value={sportCategory}
                onChange={e => setSportCategory(e.target.value)}
                placeholder="z.B. Leichtathletik, Fußball, Schwimmen…"
                className="w-full text-sm px-3 py-2.5 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-300"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Prázdné = &quot;Allgemein&quot;. Každá kategorie se průměruje zvlášť.
              </p>
            </div>
          )}

          {/* Note */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-2">
              Poznámka (nepovinné)
            </label>
            <input
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="z.B. KA 2 – Gleichungen, mündlich Gedicht…"
              className="w-full text-sm px-3 py-2.5 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-300"
            />
          </div>

          {/* Date */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-2">
              Datum
            </label>
            <input
              type="date"
              value={gradedAt}
              onChange={e => setGradedAt(e.target.value)}
              className="w-full text-sm px-3 py-2.5 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-300"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="px-5 pb-5 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 text-sm font-medium rounded-xl border border-border text-muted-foreground hover:bg-slate-50 transition-colors"
          >
            Zrušit
          </button>
          <button
            onClick={handleSubmit}
            disabled={!grade || pending}
            className="flex-1 py-2.5 text-sm font-medium rounded-xl bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 transition-colors"
          >
            {pending ? 'Ukládám…' : 'Přidat'}
          </button>
        </div>
      </div>
    </div>
  )
}
