'use client'

import { useState, useTransition } from 'react'
import { sendFeedback } from '@/app/klient/projekt/[id]/actions'
import { cn } from '@/lib/utils'

/** Nabídka hodnocení, jakmile je projekt hotový (KP06). Hodnotí se jednou. */
export function FeedbackCard({ projectId }: { projectId: string }) {
  const [nps, setNps] = useState<number | null>(null)
  const [content, setContent] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [pending, start] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (nps === null) {
      setError('Vyberte prosím číslo od 1 do 10.')
      return
    }
    setError(null)
    start(async () => {
      const res = await sendFeedback(projectId, { nps, content: content || undefined })
      if (res.success) setDone(true)
      else setError(res.error ?? 'Hodnocení se nepodařilo odeslat.')
    })
  }

  if (done) {
    return (
      <div className="rounded-box border border-navy-100 bg-surface p-5">
        <p className="font-medium text-ink">Děkujeme za hodnocení.</p>
        <p className="mt-1 text-sm text-quiet">Moc nám pomáhá.</p>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="rounded-box border border-signal-line bg-signal-bg p-5">
      <h2 className="text-lg font-semibold text-ink">Jak jste byli spokojení?</h2>
      <p className="mt-1 text-sm text-signal-ink">Projekt je hotový. Ohodnoťte nás prosím, zabere to půl minuty.</p>
      <div role="group" aria-label="Hodnocení od 1 do 10" className="mt-4 flex flex-wrap gap-1.5">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setNps(n)}
            aria-pressed={nps === n}
            className={cn(
              'h-11 w-11 rounded-chip border text-sm font-semibold',
              nps === n ? 'border-navy-700 bg-navy-700 text-white' : 'border-navy-100 bg-surface text-ink hover:border-navy-300',
            )}
          >
            {n}
          </button>
        ))}
      </div>
      <label htmlFor="portal-feedback" className="sr-only">Komentář</label>
      <textarea
        id="portal-feedback"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        maxLength={2000}
        rows={3}
        placeholder="Chcete něco dodat? (nepovinné)"
        className="mt-3 w-full rounded-chip border border-navy-100 bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-quiet focus:border-navy-400 focus:outline-none focus:ring-2 focus:ring-navy-100"
      />
      {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="mt-3 inline-flex min-h-[44px] items-center rounded-chip bg-navy-700 px-5 text-sm font-semibold text-white hover:bg-navy-800 disabled:opacity-50"
      >
        Odeslat hodnocení
      </button>
    </form>
  )
}
