'use client'

import { useState, useTransition } from 'react'
import { Scale, TrendingUp, TrendingDown, Minus, Loader2, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { logWeight, getWeightLogs, getLastWeight, type WeightLog } from './sport-actions'
import { calcBMI, bmiCategory, PROFILE } from './profile'

function today() {
  return new Date().toISOString().slice(0, 10)
}

function formatDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short' })
}

interface Props {
  initialLogs: WeightLog[]
  initialLast: WeightLog | null
}

export function WeightSection({ initialLogs, initialLast }: Props) {
  const [logs, setLogs] = useState<WeightLog[]>(initialLogs)
  const [last, setLast] = useState<WeightLog | null>(initialLast)
  const [inputVal, setInputVal] = useState('')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [saving, startSaving] = useTransition()

  const todayLog = logs.find(l => l.logged_date === today())
  const recentLogs = logs.slice(-10)

  // Trend: porovnání s nejstarším záznamem v posledních 7 dnech
  const weekAgoLogs = logs.filter(l => {
    const d = new Date(l.logged_date + 'T00:00:00')
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 7)
    return d >= cutoff
  })
  const oldest = weekAgoLogs[0]
  const newest = weekAgoLogs[weekAgoLogs.length - 1]
  const trend = oldest && newest && oldest.logged_date !== newest.logged_date
    ? +(newest.weight_kg - oldest.weight_kg).toFixed(1)
    : null

  const currentWeight = todayLog?.weight_kg ?? last?.weight_kg ?? null
  const bmi = currentWeight ? calcBMI(currentWeight) : null
  const bmiInfo = bmi ? bmiCategory(bmi) : null

  const handleSave = () => {
    setError('')
    const kg = parseFloat(inputVal.replace(',', '.'))
    if (!kg || kg < 20 || kg > 300) {
      setError('Zadej platnou váhu (20–300 kg)')
      return
    }
    startSaving(async () => {
      const res = await logWeight({ logged_date: today(), weight_kg: kg })
      if (res.error) {
        setError(res.error)
      } else {
        const [freshLogs, freshLast] = await Promise.all([getWeightLogs(30), getLastWeight()])
        setLogs(freshLogs)
        setLast(freshLast)
        setInputVal('')
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      }
    })
  }

  // Mini sparkline — výška sloupce relativní k min/max
  const sparkMin = recentLogs.length ? Math.min(...recentLogs.map(l => l.weight_kg)) - 1 : 0
  const sparkMax = recentLogs.length ? Math.max(...recentLogs.map(l => l.weight_kg)) + 1 : 1
  const sparkRange = sparkMax - sparkMin || 1

  return (
    <div className="bg-white border border-border rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border flex items-center gap-2">
        <Scale size={16} strokeWidth={1.5} className="text-rose-500" />
        <h2 className="text-base font-semibold text-foreground">Váha</h2>
      </div>

      <div className="px-5 py-5 space-y-5">
        {/* Aktuální váha + BMI */}
        <div className="flex items-end justify-between gap-4">
          <div>
            {currentWeight ? (
              <>
                <p className="text-4xl font-bold text-foreground tabular-nums">
                  {currentWeight.toFixed(1)}
                  <span className="text-lg font-normal text-muted-foreground ml-1">kg</span>
                </p>
                {todayLog
                  ? <p className="text-xs text-emerald-600 font-medium mt-1">Dnes zaznamenáno ✓</p>
                  : <p className="text-xs text-muted-foreground mt-1">Naposledy: {formatDate(last!.logged_date)}</p>
                }
              </>
            ) : (
              <p className="text-2xl font-semibold text-muted-foreground">Žádné záznamy</p>
            )}
          </div>

          {/* BMI badge */}
          {bmi && bmiInfo && (
            <div className={cn(
              'flex flex-col items-center px-4 py-2 rounded-xl border',
              bmiInfo.level === 'ok' ? 'bg-emerald-50 border-emerald-200' :
              bmiInfo.level === 'low' ? 'bg-blue-50 border-blue-200' :
              bmiInfo.level === 'high' ? 'bg-amber-50 border-amber-200' :
              'bg-red-50 border-red-200'
            )}>
              <span className={cn(
                'text-xl font-bold tabular-nums',
                bmiInfo.level === 'ok' ? 'text-emerald-700' :
                bmiInfo.level === 'low' ? 'text-blue-700' :
                bmiInfo.level === 'high' ? 'text-amber-700' : 'text-red-700'
              )}>{bmi}</span>
              <span className={cn(
                'text-xs font-semibold',
                bmiInfo.level === 'ok' ? 'text-emerald-600' :
                bmiInfo.level === 'low' ? 'text-blue-600' :
                bmiInfo.level === 'high' ? 'text-amber-600' : 'text-red-600'
              )}>BMI · {bmiInfo.label}</span>
            </div>
          )}
        </div>

        {/* Trend */}
        {trend !== null && (
          <div className={cn(
            'flex items-center gap-2 text-sm font-medium',
            trend > 0.2 ? 'text-emerald-600' :
            trend < -0.2 ? 'text-rose-600' : 'text-muted-foreground'
          )}>
            {trend > 0.2 ? <TrendingUp size={16} strokeWidth={1.5} /> :
             trend < -0.2 ? <TrendingDown size={16} strokeWidth={1.5} /> :
             <Minus size={16} strokeWidth={1.5} />}
            {trend > 0 ? '+' : ''}{trend} kg za poslední týden
          </div>
        )}

        {/* Sparkline posledních 10 dní */}
        {recentLogs.length > 1 && (
          <div>
            <p className="text-xs text-muted-foreground mb-2">Poslední záznamy</p>
            <div className="flex items-end gap-1 h-12">
              {recentLogs.map(l => {
                const h = Math.max(8, Math.round(((l.weight_kg - sparkMin) / sparkRange) * 40) + 4)
                const isToday = l.logged_date === today()
                return (
                  <div
                    key={l.logged_date}
                    className="flex-1 flex flex-col items-center gap-0.5"
                    title={`${formatDate(l.logged_date)}: ${l.weight_kg} kg`}
                  >
                    <span className="text-[8px] text-muted-foreground tabular-nums">{l.weight_kg.toFixed(1)}</span>
                    <div
                      className={cn('w-full rounded-sm', isToday ? 'bg-rose-500' : 'bg-rose-200')}
                      style={{ height: `${h}px` }}
                    />
                    <span className="text-[8px] text-muted-foreground">
                      {new Date(l.logged_date + 'T00:00:00').toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' }).replace(' ', '')}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Input pro zápis váhy */}
        <div className="pt-1 border-t border-border">
          <p className="text-sm font-medium text-foreground mb-3">
            {todayLog ? 'Aktualizovat dnešní váhu' : 'Zaznamenat dnešní váhu'}
          </p>
          <div className="flex gap-2 items-start">
            <div className="flex-1">
              <div className="relative">
                <input
                  type="number"
                  step="0.1"
                  min="20"
                  max="300"
                  value={inputVal}
                  onChange={e => { setInputVal(e.target.value); setError('') }}
                  onKeyDown={e => e.key === 'Enter' && handleSave()}
                  placeholder={todayLog ? String(todayLog.weight_kg) : (last ? String(last.weight_kg) : '53.5')}
                  className="w-full text-lg border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-rose-200 bg-background tabular-nums"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">kg</span>
              </div>
              {error && <p className="text-xs text-rose-600 mt-1">{error}</p>}
            </div>
            <button
              onClick={handleSave}
              disabled={saving || !inputVal}
              className={cn(
                'flex items-center gap-2 px-5 py-3 rounded-xl font-medium text-sm transition-colors disabled:opacity-50',
                saved
                  ? 'bg-emerald-500 text-white'
                  : 'bg-rose-500 hover:bg-rose-600 text-white'
              )}
            >
              {saving ? <Loader2 size={16} strokeWidth={1.5} className="animate-spin" /> :
               saved ? <Check size={16} strokeWidth={2} /> : null}
              {saved ? 'Uloženo!' : 'Uložit'}
            </button>
          </div>
        </div>

        {/* Výška / cíl info */}
        <p className="text-xs text-muted-foreground">
          Výška: {PROFILE.height_cm} cm · Věk: {PROFILE.age} let
        </p>
      </div>
    </div>
  )
}
