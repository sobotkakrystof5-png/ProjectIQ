'use client'

import { useState, useEffect, useCallback, useTransition } from 'react'
import { Search, Plus, Trash2, ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { parseFoodDescription, type FoodSearchResult } from '@/lib/fatsecret'
import {
  getNutritionDay,
  logFood,
  deleteFood,
  type NutritionLog,
} from './sport-actions'

const MEAL_LABELS: Record<string, string> = {
  breakfast: 'Snídaně',
  lunch: 'Oběd',
  dinner: 'Večeře',
  snack: 'Svačina',
}
const MEAL_ORDER = ['breakfast', 'lunch', 'dinner', 'snack']

const TARGETS = { calories: 2400, protein_g: 120, carbs_g: 270, fat_g: 75 }

function formatDate(iso: string) {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'long' })
}

function addDays(iso: string, n: number) {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

interface Props {
  initialDate: string
  initialLogs: NutritionLog[]
  onMutated: () => void
}

export function NutritionSection({ initialDate, initialLogs, onMutated }: Props) {
  const [date, setDate] = useState(initialDate)
  const [logs, setLogs] = useState<NutritionLog[]>(initialLogs)
  const [loadingDate, setLoadingDate] = useState(false)

  // Search state
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<FoodSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [fatSecretAvailable, setFatSecretAvailable] = useState<boolean | null>(null)

  // Selected food
  const [selectedFood, setSelectedFood] = useState<{
    food_id: string
    food_name: string
    per_g: number
    calories: number; protein_g: number; carbs_g: number; fat_g: number
  } | null>(null)
  const [amount, setAmount] = useState(100)
  const [mealType, setMealType] = useState<'breakfast' | 'lunch' | 'dinner' | 'snack'>('lunch')

  // Manual entry (when FatSecret not available)
  const [manualName, setManualName] = useState('')
  const [manualCal, setManualCal] = useState('')
  const [manualP, setManualP] = useState('')
  const [manualC, setManualC] = useState('')
  const [manualF, setManualF] = useState('')

  const [adding, startAdding] = useTransition()
  const [deleting, setDeleting] = useState<string | null>(null)

  // Check if FatSecret is configured
  useEffect(() => {
    fetch('/api/fatsecret/search?q=test')
      .then(r => {
        if (r.status === 503) setFatSecretAvailable(false)
        else setFatSecretAvailable(true)
      })
      .catch(() => setFatSecretAvailable(false))
  }, [])

  // Debounced search
  useEffect(() => {
    if (!fatSecretAvailable || query.length < 2) {
      setResults([])
      return
    }
    const t = setTimeout(async () => {
      setSearching(true)
      try {
        const r = await fetch(`/api/fatsecret/search?q=${encodeURIComponent(query)}`)
        const d = await r.json()
        setResults(Array.isArray(d) ? d : [])
      } catch {
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => clearTimeout(t)
  }, [query, fatSecretAvailable])

  const changeDate = useCallback(async (newDate: string) => {
    setDate(newDate)
    setLoadingDate(true)
    try {
      const fresh = await getNutritionDay(newDate)
      setLogs(fresh)
    } finally {
      setLoadingDate(false)
    }
  }, [])

  const selectFood = (food: FoodSearchResult) => {
    const macros = parseFoodDescription(food.food_description)
    setSelectedFood({
      food_id: food.food_id,
      food_name: food.food_name,
      per_g: macros.per_g,
      calories: macros.calories,
      protein_g: macros.protein_g,
      carbs_g: macros.carbs_g,
      fat_g: macros.fat_g,
    })
    setAmount(macros.per_g)
    setQuery('')
    setResults([])
  }

  const scaled = selectedFood
    ? {
        calories: Math.round((selectedFood.calories * amount) / selectedFood.per_g),
        protein_g: Math.round((selectedFood.protein_g * amount) / selectedFood.per_g * 10) / 10,
        carbs_g: Math.round((selectedFood.carbs_g * amount) / selectedFood.per_g * 10) / 10,
        fat_g: Math.round((selectedFood.fat_g * amount) / selectedFood.per_g * 10) / 10,
      }
    : null

  const handleAddFood = () => {
    startAdding(async () => {
      let payload: Parameters<typeof logFood>[0]

      if (selectedFood && scaled) {
        payload = {
          logged_date: date,
          food_name: selectedFood.food_name,
          food_id: selectedFood.food_id,
          ...scaled,
          fiber_g: 0,
          amount_g: amount,
          meal_type: mealType,
        }
      } else {
        if (!manualName.trim()) return
        payload = {
          logged_date: date,
          food_name: manualName.trim(),
          calories: parseFloat(manualCal) || 0,
          protein_g: parseFloat(manualP) || 0,
          carbs_g: parseFloat(manualC) || 0,
          fat_g: parseFloat(manualF) || 0,
          fiber_g: 0,
          amount_g: 100,
          meal_type: mealType,
        }
      }

      const res = await logFood(payload)
      if (!res.error) {
        const fresh = await getNutritionDay(date)
        setLogs(fresh)
        setSelectedFood(null)
        setAmount(100)
        setManualName('')
        setManualCal('')
        setManualP('')
        setManualC('')
        setManualF('')
        onMutated()
      }
    })
  }

  const handleDeleteFood = async (id: string) => {
    setDeleting(id)
    await deleteFood(id)
    const fresh = await getNutritionDay(date)
    setLogs(fresh)
    setDeleting(null)
    onMutated()
  }

  // Totals
  const totals = logs.reduce(
    (acc, l) => ({
      calories: acc.calories + l.calories,
      protein_g: acc.protein_g + l.protein_g,
      carbs_g: acc.carbs_g + l.carbs_g,
      fat_g: acc.fat_g + l.fat_g,
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  )

  const grouped = MEAL_ORDER.reduce<Record<string, NutritionLog[]>>((acc, m) => {
    acc[m] = logs.filter(l => l.meal_type === m)
    return acc
  }, {} as Record<string, NutritionLog[]>)

  const isToday = date === today()

  return (
    <div className="bg-white border border-border rounded-2xl overflow-hidden">
      {/* Section header + date nav */}
      <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">Nutriční deník</h2>
        <div className="flex items-center gap-1">
          <button
            onClick={() => changeDate(addDays(date, -1))}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted transition-colors"
          >
            <ChevronLeft size={14} strokeWidth={1.5} />
          </button>
          <span className={cn('text-xs font-medium px-2', isToday ? 'text-rose-600' : 'text-foreground')}>
            {isToday ? 'Dnes' : formatDate(date)}
          </span>
          <button
            onClick={() => changeDate(addDays(date, 1))}
            disabled={date >= today()}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted transition-colors disabled:opacity-30"
          >
            <ChevronRight size={14} strokeWidth={1.5} />
          </button>
          {!isToday && (
            <button
              onClick={() => changeDate(today())}
              className="ml-1 text-[10px] text-rose-600 hover:text-rose-700 font-medium"
            >
              Dnes
            </button>
          )}
        </div>
      </div>

      {/* Macro summary */}
      <div className="px-5 py-4 border-b border-border bg-rose-50/40">
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'kcal', value: Math.round(totals.calories), target: TARGETS.calories, color: 'bg-rose-500' },
            { label: 'Proteiny', value: `${totals.protein_g.toFixed(1)}g`, target: TARGETS.protein_g, rawVal: totals.protein_g, color: 'bg-blue-500' },
            { label: 'Sacharidy', value: `${totals.carbs_g.toFixed(1)}g`, target: TARGETS.carbs_g, rawVal: totals.carbs_g, color: 'bg-amber-500' },
            { label: 'Tuky', value: `${totals.fat_g.toFixed(1)}g`, target: TARGETS.fat_g, rawVal: totals.fat_g, color: 'bg-emerald-500' },
          ].map((m, i) => {
            const raw = i === 0 ? totals.calories : (m as any).rawVal
            const pct = Math.min(100, Math.round((raw / m.target) * 100))
            return (
              <div key={m.label}>
                <div className="flex items-baseline justify-between mb-1">
                  <span className="text-[10px] text-muted-foreground">{m.label}</span>
                  <span className="text-xs font-semibold text-foreground tabular-nums">{m.value}</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn('h-full rounded-full transition-all', m.color)}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="text-[9px] text-muted-foreground mt-0.5 text-right">{pct}% cíle</p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Search + add food */}
      <div className="px-5 py-4 border-b border-border space-y-3">
        <div className="relative">
          {fatSecretAvailable ? (
            <>
              <Search size={14} strokeWidth={1.5} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Hledat potravinu (FatSecret)…"
                className="w-full pl-9 pr-4 py-2.5 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-200 bg-background"
              />
              {searching && (
                <Loader2 size={14} strokeWidth={1.5} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground animate-spin" />
              )}
              {query && !searching && (
                <button
                  onClick={() => { setQuery(''); setResults([]) }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X size={13} strokeWidth={1.5} />
                </button>
              )}
            </>
          ) : fatSecretAvailable === false ? (
            <p className="text-xs text-muted-foreground bg-muted rounded-xl px-3 py-2.5">
              FatSecret API není nakonfigurováno — použij ruční zadání níže
            </p>
          ) : null}
        </div>

        {/* Search results dropdown */}
        {results.length > 0 && (
          <div className="border border-border rounded-xl overflow-hidden shadow-sm">
            {results.map(food => (
              <button
                key={food.food_id}
                onClick={() => selectFood(food)}
                className="w-full text-left px-3 py-2.5 hover:bg-rose-50 transition-colors border-b border-border last:border-0"
              >
                <p className="text-xs font-medium text-foreground truncate">{food.food_name}</p>
                <p className="text-[10px] text-muted-foreground truncate">{food.food_description}</p>
              </button>
            ))}
          </div>
        )}

        {/* Selected food card */}
        {selectedFood && scaled ? (
          <div className="border border-rose-200 bg-rose-50 rounded-xl p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-semibold text-foreground">{selectedFood.food_name}</p>
              <button onClick={() => setSelectedFood(null)} className="text-muted-foreground hover:text-foreground shrink-0">
                <X size={13} strokeWidth={1.5} />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={amount}
                onChange={e => setAmount(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-20 text-xs border border-border rounded-lg px-2 py-1.5 text-center tabular-nums bg-white"
                min={1}
              />
              <span className="text-xs text-muted-foreground">g</span>
              <div className="flex items-center gap-2 ml-auto text-[10px] text-muted-foreground">
                <span>{scaled.calories} kcal</span>
                <span>P: {scaled.protein_g}g</span>
                <span>S: {scaled.carbs_g}g</span>
                <span>T: {scaled.fat_g}g</span>
              </div>
            </div>
          </div>
        ) : fatSecretAvailable === false ? (
          /* Manual entry form */
          <div className="space-y-2">
            <input
              type="text"
              value={manualName}
              onChange={e => setManualName(e.target.value)}
              placeholder="Název potraviny"
              className="w-full text-sm border border-border rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-rose-200 bg-background"
            />
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: 'kcal', val: manualCal, set: setManualCal },
                { label: 'P (g)', val: manualP, set: setManualP },
                { label: 'S (g)', val: manualC, set: setManualC },
                { label: 'T (g)', val: manualF, set: setManualF },
              ].map(f => (
                <div key={f.label}>
                  <p className="text-[10px] text-muted-foreground mb-1">{f.label}</p>
                  <input
                    type="number"
                    value={f.val}
                    onChange={e => f.set(e.target.value)}
                    min={0}
                    className="w-full text-xs border border-border rounded-lg px-2 py-1.5 text-center tabular-nums bg-background focus:outline-none focus:ring-2 focus:ring-rose-200"
                  />
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Meal type + submit */}
        {(selectedFood || fatSecretAvailable === false) && (
          <div className="flex items-center gap-2">
            <select
              value={mealType}
              onChange={e => setMealType(e.target.value as typeof mealType)}
              className="text-xs border border-border rounded-lg px-2 py-1.5 bg-background focus:outline-none"
            >
              {MEAL_ORDER.map(m => (
                <option key={m} value={m}>{MEAL_LABELS[m]}</option>
              ))}
            </select>
            <button
              onClick={handleAddFood}
              disabled={adding}
              className="flex items-center gap-1.5 bg-rose-500 hover:bg-rose-600 text-white text-xs font-medium px-4 py-1.5 rounded-lg transition-colors disabled:opacity-50 ml-auto"
            >
              {adding ? <Loader2 size={12} strokeWidth={1.5} className="animate-spin" /> : <Plus size={12} strokeWidth={2} />}
              Přidat
            </button>
          </div>
        )}
      </div>

      {/* Meal groups */}
      <div className={cn('px-5 py-4 space-y-4', loadingDate && 'opacity-50 pointer-events-none')}>
        {logs.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            Žádné záznamy pro tento den
          </p>
        ) : (
          MEAL_ORDER.map(meal => {
            const items = grouped[meal]
            if (!items.length) return null
            const mealCal = items.reduce((s, l) => s + l.calories, 0)
            return (
              <div key={meal}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    {MEAL_LABELS[meal]}
                  </h3>
                  <span className="text-[10px] text-muted-foreground tabular-nums">{Math.round(mealCal)} kcal</span>
                </div>
                <div className="space-y-1">
                  {items.map(item => (
                    <div key={item.id} className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-muted/50 group">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{item.food_name}</p>
                        <p className="text-[10px] text-muted-foreground tabular-nums">
                          {item.amount_g}g · {Math.round(item.calories)} kcal · P {item.protein_g.toFixed(1)}g · S {item.carbs_g.toFixed(1)}g · T {item.fat_g.toFixed(1)}g
                        </p>
                      </div>
                      <button
                        onClick={() => handleDeleteFood(item.id)}
                        disabled={deleting === item.id}
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-rose-500 transition-all shrink-0"
                      >
                        {deleting === item.id
                          ? <Loader2 size={12} strokeWidth={1.5} className="animate-spin" />
                          : <Trash2 size={12} strokeWidth={1.5} />
                        }
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
