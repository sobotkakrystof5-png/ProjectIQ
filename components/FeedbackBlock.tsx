'use client'

import { useState, useTransition } from 'react'
import { NpsRating } from './NpsRating'
import { submitFeedback } from '@/app/portal-actions'
import { CheckCircle2, Loader2, Star } from 'lucide-react'
import { cn } from '@/lib/utils'

interface FeedbackBlockProps {
  token: string
}

export function FeedbackBlock({ token }: FeedbackBlockProps) {
  const [nps, setNps] = useState<number | null>(null)
  const [content, setContent] = useState('')
  const [isPending, startTransition] = useTransition()
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nps) { setError('Vyberte prosím hodnocení 1–10.'); return }
    setError(null)
    startTransition(async () => {
      const res = await submitFeedback(token, { nps, content: content || undefined })
      if (res.success) {
        setSubmitted(true)
      } else {
        setError(res.error ?? 'Nepodařilo se odeslat hodnocení.')
      }
    })
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center">
          <CheckCircle2 size={22} strokeWidth={1.5} className="text-emerald-600" />
        </div>
        <p className="font-semibold text-foreground text-sm">Děkujeme za vaši zpětnou vazbu!</p>
        <p className="text-xs text-muted-foreground max-w-xs">Vaše hodnocení bylo úspěšně odesláno.</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <Star size={13} strokeWidth={1.5} className="text-brand-500" />
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Vaše hodnocení</p>
      </div>

      <NpsRating value={nps} onChange={v => { setNps(v); setError(null) }} disabled={isPending} />

      <textarea
        value={content}
        onChange={e => setContent(e.target.value)}
        maxLength={2000}
        placeholder="Vyjádřete se k dosavadní práci… (nepovinné)"
        rows={3}
        disabled={isPending}
        className={cn(
          'w-full border border-border rounded-lg px-3 py-2.5 text-sm text-foreground',
          'placeholder-muted-foreground bg-white resize-none',
          'focus:outline-none focus:ring-2 focus:ring-brand-700 focus:border-transparent transition-shadow',
          isPending && 'opacity-50',
        )}
      />

      {error && (
        <p className="text-xs text-red-600 font-medium">{error}</p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className={cn(
          'w-full flex items-center justify-center gap-2',
          'brand-gradient text-white text-sm font-semibold py-2.5 rounded-lg shadow-sm',
          'hover:opacity-90 transition-opacity disabled:opacity-50',
        )}
      >
        {isPending
          ? <><Loader2 size={14} strokeWidth={1.5} className="animate-spin" /> Odesílám…</>
          : 'Odeslat hodnocení'
        }
      </button>
    </form>
  )
}
