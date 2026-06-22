'use client'

import { useState, useEffect, useCallback, useTransition } from 'react'
import { Search, Plus, Trash2, ChevronLeft, ChevronRight, Loader2, X, UtensilsCrossed } from 'lucide-react'
import { cn } from '@/lib/utils'
import { parseFoodDescription, type FoodSearchResult } from '@/lib/fatsecret'
import { getNutritionDay, logFood, deleteFood, type NutritionLog } from './sport-actions'
import { PROFILE } from './profile'

const MEAL_LABELS: Record<string, string> = {
  breakfast: 'Snídaně',
  lunch: 'Oběd',
  dinner: 'Večeře',
  snack: 'Svačina',
}
const MEAL_EMOJI: Record<string, string> = {
  breakfast: '🌅',
  lunch: '☀️',
  dinner: '🌙',
  snack: '🍎',
}
const MEAL_ORDER = ['breakfast', 'lunch', 'dinner', 'snack']

const TARGETS = {
  calories: PROFILE.daily_kcal,
  protein_g: PROFILE.protein_g,
  carbs_g: PROFILE.carbs_g,
  fat_g: PROFILE.fat_g,
}

function formatDate(iso: string) {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' })
}

function addDays(iso: string, n: number) {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

function todayIso() {
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
  const [showAddForm, setShowAddForm] = useState(false)

  // FatSecret search
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<FoodSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [fsStatus, setFsStatus] = useState<'checking' | 'ok' | 'error'>('checking')
  const [fsError, setFsError] = useState('')

  // Vybraná potravina z FatSecre nebo null pro manuální
  const [selectedFood, setSelectedFood] = useState<{
    food_name: string
    food_id?: string
    per_g: number
    calories: number
    protein_g: number
    carbs_g: number
    fat_g: number
  } | null>(null)
  const [amount, setAmount] = useState(100)
  const [mealType, setMealType] = useState<'breakfast' | 'lunch' | 'dinner' | 'snack'>('lunch')

  // Manuální zadání
  const [manualMode, setManualMode] = useState(false)
  const [manualName, setManualName] = useState('')
  const [manualCal, setManualCal] = useState('')
  const [manualP, setManualP] = useState('')
  const [manualC, setManualC] = useState('')
  const [manualF, setManualF] = useState('')

  const [adding, startAdding] = useTransition()
  const [deleting, setDeleting] = useState<string | null>(null)

  // Ověření FatSecret při načtení
  useEffect(() => {
    fetch('/api/fatsecret/search?q=test')
      .then(async r => {
        if (r.status === 503) {
          setFsStatus('error')
          setFsError('FatSecret API není nakonfigurováno')
          setManualMode(true)
        } else if (r.status >= 400) {
          const body = await r.json().catch(() => ({}))
          setFsStatus('error')
          setFsError(body.error ?? 'Chyba vyhledávání')
          setManualMode(true)
        } else {
          setFsStatus('ok')
        }
      })
      .catch(() => {
        setFsStatus('error')
        setFsError('Nelze se připojit k vyhledávání')
        setManualMode(true)
      })
  }, [])

  // Debounced search
  useEffect(() => {
    if (fsStatus !== 'ok' || query.length < 2) { setResults([]); return }
    const t = setTimeout(async () => {
      setSearching(true)
      try {
        const r = await fetch(`/api/fatsecret/search?q=${encodeURIComponent(query)}`)
        if (!r.ok) { setResults([]); return }
        const d = await r.json()
        setResults(Array.isArray(d) ? d : [])
      } catch { setResults([]) }
      finally { setSearching(false) }
    }, 350)
    return () => clearTimeout(t)
  }, [query, fsStatus])

  const changeDate = useCallback(async (newDate: string) => {
    setDate(newDate)
    setLoadingDate(true)
    setLogs(await getNutritionDay(newDate))
    setLoadingDate(false)
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
        protein_g: Math.round(((selectedFood.protein_g * amount) / selectedFood.per_g) * 10) / 10,
        carbs_g: Math.round(((selectedFood.carbs_g * amount) / selectedFood.per_g) * 10) / 10,
        fat_g: Math.round(((selectedFood.fat_g * amount) / selectedFood.per_g) * 10) / 10,
      }
    : null

  const resetForm = () => {
    setSelectedFood(null)
    setQuery('')
    setResults([])
    setManualName('')
    setManualCal('')
    setManualP('')
    setManualC('')
    setManualF('')
    setAmount(100)
  }

  const handleAdd = () => {
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
        if (!manualName.trim() || !manualCal) return
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
        setLogs(await getNutritionDay(date))
        resetForm()
        setShowAddForm(false)
        onMutated()
      }
    })
  }

  const handleDelete = async (id: string) => {
    setDeleting(id)
    await deleteFood(id)
    setLogs(await getNutritionDay(date))
    setDeleting(null)
    onMutated()
  }

  // Součty dne
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

  const isToday = date === todayIso()
  const calPct = Math.min(100, Math.round((totals.calories / TARGETS.calories) * 100))
  const canAddFood = selectedFood || (manualMode && manualName.trim() && manualCal)

  return (
    <div className="bg-white border border-border rounded-2xl overflow-hidden">
      {/* ─── Header + date nav ─────────────────────────────────────────────── */}
      <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <UtensilsCrossed size={16} strokeWidth={1.5} className="text-rose-500" />
          <h2 className="text-base font-semibold text-foreground">Jídlo</h2>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => changeDate(addDays(date, -1))}
            className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-muted transition-colors"
          >
            <ChevronLeft size={16} strokeWidth={1.5} />
          </button>
          <button
            onClick={() => isToday ? undefined : changeDate(todayIso())}
            className={cn(
              'text-sm font-medium px-3 py-1.5 rounded-xl transition-colors min-w-[120px] text-center',
              isToday ? 'text-rose-600 bg-rose-50' : 'text-foreground hover:bg-muted'
            )}
          >
            {isToday ? 'Dnes' : formatDate(date).split(',')[0]}
          </button>
          <button
            onClick={() => changeDate(addDays(date, 1))}
            disabled={date >= todayIso()}
            className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-muted transition-colors disabled:opacity-30"
          >
            <ChevronRight size={16} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* ─── Kalorický přehled ─────────────────────────────────────────────── */}
      <div className="px-5 py-5 border-b border-border bg-gradient-to-br from-rose-50/60 to-orange-50/40">
        {/* Velké číslo kalorií */}
        <div className="flex items-end justify-between mb-3">
          <div>
            <p className="text-xs text-muted-foreground font-medium mb-0.5">Kalorie dnes</p>
            <p className="text-4xl font-bold text-foreground tabular-nums leading-none">
              {Math.round(totals.calories).toLocaleString('cs-CZ')}
              <span className="text-base font-normal text-muted-foreground ml-1.5">
                / {TARGETS.calories.toLocaleString('cs-CZ')} kcal
              </span>
            </p>
          </div>
          <span className={cn(
            'text-2xl font-bold tabular-nums',
            calPct >= 90 && calPct <= 115 ? 'text-emerald-600' :
            calPct < 60 ? 'text-muted-foreground' : 'text-amber-600'
          )}>
            {calPct}%
          </span>
        </div>

        {/* Velký progress bar */}
        <div className="h-4 bg-white/80 rounded-full overflow-hidden border border-rose-100 mb-4">
          <div
            className={cn(
              'h-full rounded-full transition-all',
              calPct > 115 ? 'bg-amber-400' : 'bg-rose-500'
            )}
            style={{ width: `${calPct}%` }}
          />
        </div>

        {/* Makra — 3 sloupce */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Bílkoviny', value: totals.protein_g, target: TARGETS.protein_g, color: 'bg-blue-400', unit: 'g' },
            { label: 'Sacharidy', value: totals.carbs_g, target: TARGETS.carbs_g, color: 'bg-amber-400', unit: 'g' },
            { label: 'Tuky', value: totals.fat_g, target: TARGETS.fat_g, color: 'bg-emerald-400', unit: 'g' },
          ].map(m => {
            const pct = Math.min(100, Math.round((m.value / m.target) * 100))
            return (
              <div key={m.label} className="bg-white/70 rounded-xl px-3 py-2.5">
                <div className="flex items-baseline justify-between mb-1.5">
                  <span className="text-xs text-muted-foreground">{m.label}</span>
                  <span className="text-xs font-bold tabular-nums text-foreground">
                    {m.value.toFixed(0)}{m.unit}
                  </span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className={cn('h-full rounded-full', m.color)} style={{ width: `${pct}%` }} />
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">cíl: {m.target}{m.unit}</p>
              </div>
            )
          })}
        </div>
      </div>

      {/* ─── Přidat jídlo ──────────────────────────────────────────────────── */}
      <div className="px-5 py-4 border-b border-border">
        {!showAddForm ? (
          <button
            onClick={() => setShowAddForm(true)}
            className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-rose-200 rounded-xl text-rose-600 hover:bg-rose-50 hover:border-rose-300 transition-colors font-medium text-sm"
          >
            <Plus size={16} strokeWidth={2} />
            Přidat jídlo
          </button>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">Přidat jídlo</p>
              <button
                onClick={() => { resetForm(); setShowAddForm(false) }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X size={16} strokeWidth={1.5} />
              </button>
            </div>

            {/* Jídlo (snídaně/oběd/večeře/svačina) */}
            <div className="grid grid-cols-4 gap-1.5">
              {MEAL_ORDER.map(m => (
                <button
                  key={m}
                  onClick={() => setMealType(m as typeof mealType)}
                  className={cn(
                    'py-2 px-1 rounded-xl text-xs font-medium border transition-colors text-center',
                    mealType === m
                      ? 'bg-rose-500 text-white border-rose-500'
                      : 'bg-white text-muted-foreground border-border hover:border-rose-200 hover:text-foreground'
                  )}
                >
                  {MEAL_EMOJI[m]} {MEAL_LABELS[m]}
                </button>
              ))}
            </div>

            {/* Toggle: hledat / zadat ručně */}
            {fsStatus !== 'checking' && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setManualMode(false); resetForm() }}
                  className={cn(
                    'text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors',
                    !manualMode
                      ? 'bg-foreground text-background border-foreground'
                      : 'bg-white text-muted-foreground border-border hover:border-foreground'
                  )}
                  disabled={fsStatus === 'error'}
                >
                  🔍 Vyhledat
                </button>
                <button
                  onClick={() => { setManualMode(true); setSelectedFood(null); setQuery(''); setResults([]) }}
                  className={cn(
                    'text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors',
                    manualMode
                      ? 'bg-foreground text-background border-foreground'
                      : 'bg-white text-muted-foreground border-border hover:border-foreground'
                  )}
                >
                  ✏️ Zadat ručně
                </button>
                {fsStatus === 'error' && (
                  <span className="text-xs text-amber-600 ml-1">{fsError}</span>
                )}
              </div>
            )}

            {/* Vyhledávání FatSecret */}
            {!manualMode && fsStatus === 'ok' && (
              <div className="space-y-2">
                <div className="relative">
                  <Search size={15} strokeWidth={1.5} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    value={query}
                    onChange={e => { setQuery(e.target.value); setSelectedFood(null) }}
                    placeholder="Např. kuřecí prso, ovesná kaše…"
                    className="w-full pl-9 pr-9 py-3 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-200 bg-background"
                    autoFocus
                  />
                  {searching && (
                    <Loader2 size={14} strokeWidth={1.5} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground animate-spin" />
                  )}
                  {query && !searching && (
                    <button
                      onClick={() => { setQuery(''); setResults([]); setSelectedFood(null) }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X size={14} strokeWidth={1.5} />
                    </button>
                  )}
                </div>

                {/* Výsledky hledání */}
                {results.length > 0 && !selectedFood && (
                  <div className="border border-border rounded-xl overflow-hidden shadow-sm">
                    {results.map(food => (
                      <button
                        key={food.food_id}
                        onClick={() => selectFood(food)}
                        className="w-full text-left px-4 py-3 hover:bg-rose-50 transition-colors border-b border-border last:border-0"
                      >
                        <p className="text-sm font-medium text-foreground">{food.food_name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{food.food_description}</p>
                      </button>
                    ))}
                  </div>
                )}

                {/* Vybraná potravina + gramáž */}
                {selectedFood && scaled && (
                  <div className="border border-rose-200 bg-rose-50/60 rounded-xl p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-foreground">{selectedFood.food_name}</p>
                      <button onClick={() => setSelectedFood(null)} className="text-muted-foreground hover:text-foreground shrink-0">
                        <X size={14} strokeWidth={1.5} />
                      </button>
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="text-sm text-muted-foreground shrink-0">Množství:</label>
                      <input
                        type="number"
                        value={amount}
                        onChange={e => setAmount(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-24 text-base border border-border rounded-lg px-3 py-2 text-center tabular-nums bg-white font-semibold focus:outline-none focus:ring-2 focus:ring-rose-200"
                        min={1}
                      />
                      <span className="text-sm text-muted-foreground">g</span>
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-center">
                      {[
                        { label: 'Kalorie', value: `${scaled.calories} kcal` },
                        { label: 'Bílkoviny', value: `${scaled.protein_g}g` },
                        { label: 'Sacharidy', value: `${scaled.carbs_g}g` },
                        { label: 'Tuky', value: `${scaled.fat_g}g` },
                      ].map(x => (
                        <div key={x.label} className="bg-white rounded-lg py-1.5">
                          <p className="text-xs font-semibold text-foreground">{x.value}</p>
                          <p className="text-[10px] text-muted-foreground">{x.label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Manuální zadání */}
            {manualMode && (
              <div className="space-y-3">
                <input
                  type="text"
                  value={manualName}
                  onChange={e => setManualName(e.target.value)}
                  placeholder="Název jídla (např. Kuřecí řízek)"
                  className="w-full text-sm border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-rose-200 bg-background"
                  autoFocus
                />
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block font-medium">Kalorie (kcal) *</label>
                    <input
                      type="number"
                      value={manualCal}
                      onChange={e => setManualCal(e.target.value)}
                      placeholder="350"
                      min={0}
                      className="w-full text-sm border border-border rounded-xl px-3 py-2.5 text-center tabular-nums bg-background focus:outline-none focus:ring-2 focus:ring-rose-200"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block font-medium">Bílkoviny (g)</label>
                    <input
                      type="number"
                      value={manualP}
                      onChange={e => setManualP(e.target.value)}
                      placeholder="30"
                      min={0}
                      className="w-full text-sm border border-border rounded-xl px-3 py-2.5 text-center tabular-nums bg-background focus:outline-none focus:ring-2 focus:ring-rose-200"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block font-medium">Sacharidy (g)</label>
                    <input
                      type="number"
                      value={manualC}
                      onChange={e => setManualC(e.target.value)}
                      placeholder="40"
                      min={0}
                      className="w-full text-sm border border-border rounded-xl px-3 py-2.5 text-center tabular-nums bg-background focus:outline-none focus:ring-2 focus:ring-rose-200"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block font-medium">Tuky (g)</label>
                    <input
                      type="number"
                      value={manualF}
                      onChange={e => setManualF(e.target.value)}
                      placeholder="12"
                      min={0}
                      className="w-full text-sm border border-border rounded-xl px-3 py-2.5 text-center tabular-nums bg-background focus:outline-none focus:ring-2 focus:ring-rose-200"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Tlačítko přidat */}
            {(canAddFood) && (
              <button
                onClick={handleAdd}
                disabled={adding}
                className="w-full flex items-center justify-center gap-2 bg-rose-500 hover:bg-rose-600 text-white text-sm font-semibold py-3 rounded-xl transition-colors disabled:opacity-50"
              >
                {adding ? <Loader2 size={16} strokeWidth={1.5} className="animate-spin" /> : <Plus size={16} strokeWidth={2} />}
                Přidat do {MEAL_LABELS[mealType].toLowerCase()}
              </button>
            )}
          </div>
        )}
      </div>

      {/* ─── Seznam jídel ─────────────────────────────────────────────────── */}
      <div className={cn('divide-y divide-border', loadingDate && 'opacity-50 pointer-events-none')}>
        {logs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Žádné záznamy pro tento den — přidej první jídlo
          </p>
        ) : (
          MEAL_ORDER.map(meal => {
            const items = grouped[meal]
            if (!items.length) return null
            const mealCal = items.reduce((s, l) => s + l.calories, 0)
            return (
              <div key={meal} className="px-5 py-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <span>{MEAL_EMOJI[meal]}</span>
                    {MEAL_LABELS[meal]}
                  </h3>
                  <span className="text-sm font-semibold text-muted-foreground tabular-nums">
                    {Math.round(mealCal)} kcal
                  </span>
                </div>
                <div className="space-y-2">
                  {items.map(item => (
                    <div key={item.id} className="flex items-center gap-3 py-2 px-3 rounded-xl hover:bg-muted/50 group transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{item.food_name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
                          {item.amount_g}g · {Math.round(item.calories)} kcal
                          {item.protein_g > 0 && ` · 🥩 ${item.protein_g.toFixed(1)}g`}
                          {item.carbs_g > 0 && ` · 🍞 ${item.carbs_g.toFixed(1)}g`}
                          {item.fat_g > 0 && ` · 🥑 ${item.fat_g.toFixed(1)}g`}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDelete(item.id)}
                        disabled={deleting === item.id}
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-rose-500 transition-all shrink-0 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-rose-50"
                        title="Smazat"
                      >
                        {deleting === item.id
                          ? <Loader2 size={14} strokeWidth={1.5} className="animate-spin" />
                          : <Trash2 size={14} strokeWidth={1.5} />
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
