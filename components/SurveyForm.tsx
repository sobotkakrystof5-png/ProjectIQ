'use client'

import { useState, useTransition } from 'react'
import { Star, CheckCircle2, Loader2 } from 'lucide-react'
import { submitSurvey } from '@/app/portal-actions'
import { SURVEY_CATEGORIES, type SurveyRatingKey } from '@/lib/types'
import { cn } from '@/lib/utils'

interface SurveyFormProps {
  token: string
}

function StarRating({
  value,
  onChange,
  disabled,
}: {
  value: number
  onChange: (v: number) => void
  disabled?: boolean
}) {
  const [hover, setHover] = useState<number | null>(null)
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map(n => {
        const active = (hover ?? value) >= n
        return (
          <button
            key={n}
            type="button"
            disabled={disabled}
            onClick={() => onChange(n)}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(null)}
            className="p-0.5 disabled:cursor-not-allowed transition-transform hover:scale-110"
            aria-label={`${n} z 5`}
          >
            <Star
              size={26}
              strokeWidth={1.5}
              className={cn(
                'transition-colors',
                active ? 'fill-amber-400 text-amber-400' : 'text-slate-300',
              )}
            />
          </button>
        )
      })}
    </div>
  )
}

export function SurveyForm({ token }: SurveyFormProps) {
  const [ratings, setRatings] = useState<Record<SurveyRatingKey, number>>({
    rating_cooperation: 0,
    rating_speed: 0,
    rating_design: 0,
    rating_functionality: 0,
    rating_reliability: 0,
    rating_flexibility: 0,
  })
  const [reference, setReference] = useState('')
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [isPending, startTransition] = useTransition()

  function setRating(key: SurveyRatingKey, value: number) {
    setRatings(prev => ({ ...prev, [key]: value }))
    setError(null)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (SURVEY_CATEGORIES.some(c => ratings[c.key] < 1)) {
      setError('Ohodnoťte prosím všechny oblasti hvězdičkami.')
      return
    }
    if (!consent) {
      setError('Pro odeslání je nutné potvrdit souhlas.')
      return
    }
    setError(null)
    startTransition(async () => {
      const res = await submitSurvey(token, {
        ...ratings,
        reference_text: reference || undefined,
        consent: true,
      })
      if (res.success) setSubmitted(true)
      else setError(res.error ?? 'Nepodařilo se odeslat dotazník.')
    })
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <div className="w-14 h-14 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center">
          <CheckCircle2 size={28} strokeWidth={1.5} className="text-emerald-600" />
        </div>
        <p className="font-semibold text-foreground">Děkuji za vyplnění dotazníku!</p>
        <p className="text-sm text-muted-foreground max-w-sm">
          Vaše odpovědi byly úspěšně odeslány. Velmi si vaší zpětné vazby vážím.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        {SURVEY_CATEGORIES.map(cat => (
          <div
            key={cat.key}
            className="flex items-center justify-between gap-3 border-b border-border/60 pb-3 last:border-0 last:pb-0"
          >
            <span className="text-sm font-medium text-foreground">{cat.label}</span>
            <StarRating
              value={ratings[cat.key]}
              onChange={v => setRating(cat.key, v)}
              disabled={isPending}
            />
          </div>
        ))}
      </div>

      <div>
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
          Reference (nepovinné)
        </label>
        <textarea
          value={reference}
          onChange={e => setReference(e.target.value)}
          maxLength={3000}
          rows={4}
          disabled={isPending}
          placeholder="Napište referenci na naši spolupráci — co se vám líbilo, jak jste byli spokojeni…"
          className={cn(
            'w-full border border-border rounded-lg px-3 py-2.5 text-sm text-foreground',
            'placeholder-muted-foreground bg-white resize-none',
            'focus:outline-none focus:ring-2 focus:ring-brand-700 focus:border-transparent transition-shadow',
            isPending && 'opacity-50',
          )}
        />
      </div>

      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={consent}
          onChange={e => { setConsent(e.target.checked); setError(null) }}
          disabled={isPending}
          className="w-4 h-4 mt-0.5 accent-brand-700 shrink-0"
        />
        <span className="text-xs text-muted-foreground leading-relaxed">
          Souhlasím, že mé odpovědi mohou být využity pro zkvalitňování služeb a zveřejněny
          (např. jako reference) na webu vizeon.cz a souvisejících materiálech, a že s nimi
          může být dále nakládáno.
        </span>
      </label>

      {error && <p className="text-xs text-red-600 font-medium">{error}</p>}

      <button
        type="submit"
        disabled={isPending}
        className={cn(
          'w-full flex items-center justify-center gap-2',
          'brand-gradient text-white text-sm font-semibold py-3 rounded-lg shadow-sm',
          'hover:opacity-90 transition-opacity disabled:opacity-50',
        )}
      >
        {isPending
          ? <><Loader2 size={15} strokeWidth={1.5} className="animate-spin" /> Odesílám…</>
          : 'Odeslat dotazník'}
      </button>
    </form>
  )
}
