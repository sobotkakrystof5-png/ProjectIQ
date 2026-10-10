'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { sendReview } from '@/app/z/[token]/actions'
import { cn } from '@/lib/ws/utils'

/** Hodnocení 1–10 s komentářem (S16). Jedno na termín nebo zakázku, hlídá DB. */
export function ReviewForm({ token }: { token: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [score, setScore] = useState<number | null>(null)
  const [comment, setComment] = useState('')
  const [website, setWebsite] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (score === null) {
      setError('Vyberte prosím číslo od 1 do 10.')
      return
    }
    setError(null)
    start(async () => {
      const res = await sendReview({ token, score, comment, website })
      if (!res.ok) {
        setError(res.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-[15px] text-quiet">1 = vůbec, 10 = úplně</legend>
        <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={score === n}
              aria-label={`${n} z 10`}
              onClick={() => setScore(n)}
              className={cn(
                'inline-flex h-11 items-center justify-center rounded-chip font-num text-[15px] font-semibold transition-colors',
                score === n ? 'bg-navy-700 text-white' : 'bg-navy-50 text-navy-900 hover:bg-navy-100',
              )}
            >
              {n}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
        Chcete něco dodat? (nepovinné)
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={1000}
          rows={3}
          className="min-h-[88px] rounded-chip border border-navy-100 bg-surface px-3 py-2 text-[15px] font-normal text-ink outline-none focus:border-navy-500 focus:ring-2 focus:ring-navy-100"
        />
      </label>

      {/* Past na roboty — člověk pole nevidí. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Web
          <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </label>
      </div>

      {error && (
        <p className="text-[15px] text-danger" role="alert">
          {error}
        </p>
      )}

      <Button type="submit" className="self-start" disabled={pending}>
        Odeslat hodnocení
      </Button>
    </form>
  )
}
