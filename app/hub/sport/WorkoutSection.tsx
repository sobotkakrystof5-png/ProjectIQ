'use client'

import { useState, useTransition } from 'react'
import { Dumbbell, Plus, Trash2, Loader2, Clock, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  logWorkout,
  deleteWorkout,
  getWorkoutsRecent,
  type WorkoutLog,
} from './sport-actions'

export const MUSCLE_GROUPS = [
  'Prsa', 'Záda', 'Ramena', 'Bicepsy', 'Tricepsy', 'Nohy', 'Břicho', 'Kardio',
]

export const MUSCLE_COLORS: Record<string, string> = {
  'Prsa': 'bg-rose-400',
  'Záda': 'bg-blue-400',
  'Ramena': 'bg-violet-400',
  'Bicepsy': 'bg-amber-400',
  'Tricepsy': 'bg-orange-400',
  'Nohy': 'bg-emerald-400',
  'Břicho': 'bg-cyan-400',
  'Kardio': 'bg-red-400',
}

const MUSCLE_TEXT: Record<string, string> = {
  'Prsa': 'text-rose-700 bg-rose-50 border-rose-200',
  'Záda': 'text-blue-700 bg-blue-50 border-blue-200',
  'Ramena': 'text-violet-700 bg-violet-50 border-violet-200',
  'Bicepsy': 'text-amber-700 bg-amber-50 border-amber-200',
  'Tricepsy': 'text-orange-700 bg-orange-50 border-orange-200',
  'Nohy': 'text-emerald-700 bg-emerald-50 border-emerald-200',
  'Břicho': 'text-cyan-700 bg-cyan-50 border-cyan-200',
  'Kardio': 'text-red-700 bg-red-50 border-red-200',
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function formatDate(iso: string) {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short' })
}

interface Props {
  initialWorkouts: WorkoutLog[]
  onMutated: () => void
}

export function WorkoutSection({ initialWorkouts, onMutated }: Props) {
  const [workouts, setWorkouts] = useState<WorkoutLog[]>(initialWorkouts)
  const [showForm, setShowForm] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [adding, startAdding] = useTransition()

  // Form state
  const [date, setDate] = useState(today())
  const [title, setTitle] = useState('')
  const [muscles, setMuscles] = useState<string[]>([])
  const [duration, setDuration] = useState('')
  const [notes, setNotes] = useState('')
  const [formError, setFormError] = useState('')

  const toggleMuscle = (m: string) => {
    setMuscles(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m])
  }

  const handleAdd = () => {
    setFormError('')
    startAdding(async () => {
      const res = await logWorkout({
        logged_date: date,
        title: title.trim(),
        muscle_groups: muscles,
        duration_min: duration ? parseInt(duration) : null,
        notes: notes.trim() || undefined,
      })
      if (res.error) {
        setFormError(res.error)
      } else {
        const fresh = await getWorkoutsRecent()
        setWorkouts(fresh)
        setTitle('')
        setMuscles([])
        setDuration('')
        setNotes('')
        setShowForm(false)
        onMutated()
      }
    })
  }

  const handleDelete = async (id: string) => {
    setDeleting(id)
    await deleteWorkout(id)
    const fresh = await getWorkoutsRecent()
    setWorkouts(fresh)
    setDeleting(null)
    onMutated()
  }

  return (
    <div className="bg-white border border-border rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Dumbbell size={14} strokeWidth={1.5} className="text-rose-500" />
          <h2 className="text-sm font-semibold text-foreground">Gym log</h2>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1 text-xs text-rose-600 hover:text-rose-700 font-medium"
        >
          {showForm ? <ChevronUp size={13} strokeWidth={1.5} /> : <Plus size={13} strokeWidth={2} />}
          {showForm ? 'Zavřít' : 'Přidat trénink'}
        </button>
      </div>

      {/* Add workout form */}
      {showForm && (
        <div className="px-5 py-4 border-b border-border bg-rose-50/40 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium block mb-1">Datum</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                max={today()}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-rose-200"
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium block mb-1">Název tréninku</label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Push day, Nohy, Kardio…"
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-rose-200"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium block mb-1.5">Svalové skupiny</label>
            <div className="flex flex-wrap gap-1.5">
              {MUSCLE_GROUPS.map(m => (
                <button
                  key={m}
                  onClick={() => toggleMuscle(m)}
                  className={cn(
                    'text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors',
                    muscles.includes(m)
                      ? MUSCLE_TEXT[m]
                      : 'text-muted-foreground bg-white border-border hover:border-rose-200'
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium block mb-1">Doba (minuty)</label>
              <input
                type="number"
                value={duration}
                onChange={e => setDuration(e.target.value)}
                placeholder="60"
                min={1}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-rose-200"
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium block mb-1">Poznámky</label>
              <input
                type="text"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Volitelně…"
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-rose-200"
              />
            </div>
          </div>

          {formError && <p className="text-xs text-rose-600">{formError}</p>}

          <div className="flex justify-end">
            <button
              onClick={handleAdd}
              disabled={adding || !title.trim()}
              className="flex items-center gap-1.5 bg-rose-500 hover:bg-rose-600 text-white text-xs font-medium px-5 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              {adding ? <Loader2 size={12} strokeWidth={1.5} className="animate-spin" /> : <Plus size={12} strokeWidth={2} />}
              Uložit trénink
            </button>
          </div>
        </div>
      )}

      {/* Workout list */}
      <div className="px-5 py-4 space-y-2">
        {workouts.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            Žádné tréninky — přidej první
          </p>
        ) : (
          workouts.map(w => (
            <div key={w.id} className="flex items-start gap-3 py-2 px-2 rounded-xl hover:bg-muted/40 group transition-colors">
              <div className="flex flex-col items-center gap-1 shrink-0 pt-0.5">
                <div className={cn(
                  'w-2 h-2 rounded-full',
                  w.muscle_groups[0] ? MUSCLE_COLORS[w.muscle_groups[0]] ?? 'bg-rose-400' : 'bg-rose-400'
                )} />
                <span className="text-[9px] text-muted-foreground tabular-nums">{formatDate(w.logged_date)}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground">{w.title}</p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  {w.muscle_groups.map(mg => (
                    <span
                      key={mg}
                      className={cn('text-[9px] font-medium px-1.5 py-0.5 rounded-full border', MUSCLE_TEXT[mg] ?? 'text-muted-foreground bg-muted border-border')}
                    >
                      {mg}
                    </span>
                  ))}
                  {w.duration_min && (
                    <span className="flex items-center gap-0.5 text-[9px] text-muted-foreground">
                      <Clock size={9} strokeWidth={1.5} />
                      {w.duration_min} min
                    </span>
                  )}
                </div>
                {w.notes && <p className="text-[10px] text-muted-foreground mt-0.5">{w.notes}</p>}
              </div>
              <button
                onClick={() => handleDelete(w.id)}
                disabled={deleting === w.id}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-rose-500 transition-all shrink-0 mt-0.5"
              >
                {deleting === w.id
                  ? <Loader2 size={12} strokeWidth={1.5} className="animate-spin" />
                  : <Trash2 size={12} strokeWidth={1.5} />
                }
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
