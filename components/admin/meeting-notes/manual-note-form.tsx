'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { addManualMeetingNote } from '@/app/meeting-notes-actions'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'

/**
 * Ruční vložení přepisu (R-144): ve Wispr Flow „Copy as Markdown" a vložit
 * sem, nebo přepis odjinud. Text se uloží přesně, jak je — shrnutí a klienta
 * pak dodělá AI stejně jako u schůzek, které přijdou samy.
 */

const FIELD = 'min-h-11 w-full rounded-chip border border-navy-200 bg-surface px-3 text-[15px] text-ink focus:border-navy-700 focus:outline-none'

export function ManualNoteForm({ today, now }: { today: string; now: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(today)
  const [time, setTime] = useState(now)
  const [minutes, setMinutes] = useState('')
  const [transcript, setTranscript] = useState('')

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    start(async () => {
      const result = await addManualMeetingNote({
        title,
        date,
        time,
        minutes: minutes ? Number(minutes) : undefined,
        transcript,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('Přepis je uložený. Shrnutí bude hotové do minuty.')
      router.push(`/dashboard/schuzky/${result.id}`)
    })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="mn-title" className="text-sm font-medium text-ink">
          Název <span className="font-normal text-quiet">(nepovinné, jinak ho navrhne AI)</span>
        </label>
        <input id="mn-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className={FIELD} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="mn-date" className="text-sm font-medium text-ink">Den</label>
          <input id="mn-date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={FIELD} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="mn-time" className="text-sm font-medium text-ink">Začátek</label>
          <input id="mn-time" type="time" required value={time} onChange={(e) => setTime(e.target.value)} className={FIELD} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="mn-minutes" className="text-sm font-medium text-ink">
            Délka v minutách <span className="font-normal text-quiet">(nepovinné)</span>
          </label>
          <input
            id="mn-minutes"
            type="number"
            inputMode="numeric"
            min={1}
            max={600}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            className={FIELD}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="mn-transcript" className="text-sm font-medium text-ink">Přepis</label>
        <p id="mn-transcript-hint" className="text-sm text-quiet">
          Ve Wispr Flow otevřete schůzku, v menu zvolte Copy as Markdown a vložte sem. Uloží se přesně tak, jak je.
        </p>
        <textarea
          id="mn-transcript"
          aria-describedby="mn-transcript-hint"
          required
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          rows={16}
          className="w-full rounded-chip border border-navy-200 bg-surface p-3 font-num text-sm leading-relaxed text-ink focus:border-navy-700 focus:outline-none"
        />
        <p className="text-right text-xs text-quiet">{transcript.length.toLocaleString('cs-CZ')} znaků</p>
      </div>

      <div>
        <Button type="submit" disabled={pending || transcript.trim().length < 20}>
          {pending ? 'Ukládám…' : 'Uložit a shrnout'}
        </Button>
      </div>
    </form>
  )
}
