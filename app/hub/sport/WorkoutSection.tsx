'use client'

import { useState, useTransition } from 'react'
import { Dumbbell, Plus, Trash2, Loader2, Clock, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { logWorkout, deleteWorkout, getWorkoutsRecent, type WorkoutLog } from './sport-actions'

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

const MUSCLE_BADGE: Record<string, string> = {
  'Prsa': 'text-rose-700 bg-rose-50 border-rose-200',
  'Záda': 'text-blue-700 bg-blue-50 border-blue-200',
  'Ramena': 'text-violet-700 bg-violet-50 border-violet-200',
  'Bicepsy': 'text-amber-700 bg-amber-50 border-amber-200',
  'Tricepsy': 'text-orange-700 bg-orange-50 border-orange-200',
  'Nohy': 'text-emerald-700 bg-emerald-50 border-emerald-200',
  'Břicho': 'text-cyan-700 bg-cyan-50 border-cyan-200',
  'Kardio': 'text-red-700 bg-red-50 border-red-200',
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function formatRelDate(iso: string) {
  const today = todayIso()
  const d = new Date(iso + 'T00:00:00')
  if (iso === today) return 'Dnes'
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  if (iso === yesterday.toISOString().slice(0, 10)) return 'Včera'
  return d.toLocaleDateString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'short' })
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

  const [date, setDate] = useState(todayIso())
  const [title, setTitle] = useState('')
  const [muscles, setMuscles] = useState<string[]>([])
  const [duration, setDuration] = useState('')
  const [notes, setNotes] = useState('')
  const [formError, setFormError] = useState('')

  const toggleMuscle = (m: string) =>
    setMuscles(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m])

  const resetForm = () => {
    setTitle('')
    setMuscles([])
    setDuration('')
    setNotes('')
    setFormError('')
    setDate(todayIso())
  }

  const handleAdd = () => {
    setFormError('')
    if (!title.trim()) { setFormError('Zadej název tréninku'); return }
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
        setWorkouts(await getWorkoutsRecent())
        resetForm()
        setShowForm(false)
        onMutated()
      }
    })
  }

  const handleDelete = async (id: string) => {
    setDeleting(id)
    await deleteWorkout(id)
    setWorkouts(await getWorkoutsRecent())
    setDeleting(null)
    onMutated()
  }

  const todayWorkouts = workouts.filter(w => w.logged_date === todayIso())
  const pastWorkouts = workouts.filter(w => w.logged_date !== todayIso()).slice(0, 10)

  return (
    <div className="bg-white border border-border rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Dumbbell size={16} strokeWidth={1.5} className="text-rose-500" />
          <h2 className="text-base font-semibold text-foreground">Trénink</h2>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 text-sm text-rose-600 hover:text-rose-700 font-medium"
          >
            <Plus size={15} strokeWidth={2} />
            Přidat trénink
          </button>
        )}
      </div>

      {/* Dnešní tréninky — rychlý přehled */}
      {todayWorkouts.length > 0 && !showForm && (
        <div className="px-5 py-4 bg-emerald-50/60 border-b border-border">
          <p className="text-xs font-semibold text-emerald-700 mb-2">✅ Dnes jsi trénoval/a</p>
          {todayWorkouts.map(w => (
            <div key={w.id} className="flex items-center gap-2">
              <p className="text-sm font-semibold text-foreground">{w.title}</p>
              {w.duration_min && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock size={11} strokeWidth={1.5} />
                  {w.duration_min} min
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Formulář přidání */}
      {showForm && (
        <div className="px-5 py-5 border-b border-border bg-rose-50/30 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">Nový trénink</p>
            <button onClick={() => { resetForm(); setShowForm(false) }} className="text-muted-foreground hover:text-foreground">
              <X size={16} strokeWidth={1.5} />
            </button>
          </div>

          {/* Název */}
          <div>
            <label className="text-xs text-muted-foreground font-medium block mb-1.5">Název tréninku *</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Push day, Nohy, Kardio, Plavání…"
              className="w-full text-sm border border-border rounded-xl px-4 py-3 bg-white focus:outline-none focus:ring-2 focus:ring-rose-200"
              autoFocus
            />
          </div>

          {/* Svalové skupiny */}
          <div>
            <label className="text-xs text-muted-foreground font-medium block mb-2">Co jsi cvičil/a? (volitelné)</label>
            <div className="flex flex-wrap gap-2">
              {MUSCLE_GROUPS.map(m => (
                <button
                  key={m}
                  onClick={() => toggleMuscle(m)}
                  className={cn(
                    'text-sm font-medium px-3 py-1.5 rounded-xl border transition-colors',
                    muscles.includes(m)
                      ? MUSCLE_BADGE[m]
                      : 'text-muted-foreground bg-white border-border hover:border-rose-200 hover:text-foreground'
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Datum + Délka */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground font-medium block mb-1.5">Datum</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                max={todayIso()}
                className="w-full text-sm border border-border rounded-xl px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-rose-200"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-medium block mb-1.5">Délka (minuty)</label>
              <input
                type="number"
                value={duration}
                onChange={e => setDuration(e.target.value)}
                placeholder="60"
                min={1}
                className="w-full text-sm border border-border rounded-xl px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-rose-200 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>
          </div>

          {/* Poznámky */}
          <div>
            <label className="text-xs text-muted-foreground font-medium block mb-1.5">Poznámka (volitelné)</label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Nový rekord, únava, co se povedlo…"
              className="w-full text-sm border border-border rounded-xl px-4 py-3 bg-white focus:outline-none focus:ring-2 focus:ring-rose-200"
            />
          </div>

          {formError && <p className="text-sm text-rose-600">{formError}</p>}

          <button
            onClick={handleAdd}
            disabled={adding || !title.trim()}
            className="w-full flex items-center justify-center gap-2 bg-rose-500 hover:bg-rose-600 text-white text-sm font-semibold py-3 rounded-xl transition-colors disabled:opacity-50"
          >
            {adding ? <Loader2 size={16} strokeWidth={1.5} className="animate-spin" /> : <Plus size={16} strokeWidth={2} />}
            Uložit trénink
          </button>
        </div>
      )}

      {/* Historie tréninků */}
      <div className="divide-y divide-border/60">
        {workouts.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Žádné tréninky — přidej první
          </p>
        ) : (
          pastWorkouts.map(w => (
            <div key={w.id} className="flex items-start gap-3 px-5 py-4 hover:bg-muted/30 group transition-colors">
              <div className={cn(
                'w-2 h-2 rounded-full mt-2 shrink-0',
                w.muscle_groups[0] ? MUSCLE_COLORS[w.muscle_groups[0]] ?? 'bg-rose-400' : 'bg-rose-400'
              )} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-foreground">{w.title}</p>
                  <span className="text-xs text-muted-foreground">{formatRelDate(w.logged_date)}</span>
                  {w.duration_min && (
                    <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                      <Clock size={11} strokeWidth={1.5} />
                      {w.duration_min} min
                    </span>
                  )}
                </div>
                {w.muscle_groups.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {w.muscle_groups.map(mg => (
                      <span
                        key={mg}
                        className={cn('text-xs font-medium px-2 py-0.5 rounded-full border', MUSCLE_BADGE[mg] ?? 'text-muted-foreground bg-muted border-border')}
                      >
                        {mg}
                      </span>
                    ))}
                  </div>
                )}
                {w.notes && <p className="text-xs text-muted-foreground mt-1">{w.notes}</p>}
              </div>
              <button
                onClick={() => handleDelete(w.id)}
                disabled={deleting === w.id}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-rose-500 transition-all shrink-0 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-rose-50"
              >
                {deleting === w.id
                  ? <Loader2 size={13} strokeWidth={1.5} className="animate-spin" />
                  : <Trash2 size={13} strokeWidth={1.5} />
                }
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
