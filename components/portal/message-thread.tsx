'use client'

import { useState, useTransition } from 'react'
import { sendMessage } from '@/app/klient/projekt/[id]/actions'
import { formatDateTime, cn } from '@/lib/utils'

export interface ThreadMessage {
  id: string
  author: 'client' | 'admin'
  body: string
  createdAt: string
}

/** Zprávy mezi klientem a námi; nové se píšou pod seznamem. */
export function MessageThread({ projectId, messages }: { projectId: string; messages: ThreadMessage[] }) {
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim()) return
    setError(null)
    start(async () => {
      const res = await sendMessage(projectId, { body })
      if (res.success) setBody('')
      else setError(res.error ?? 'Zprávu se nepodařilo odeslat.')
    })
  }

  return (
    <div className="space-y-4">
      {messages.length === 0 ? (
        <p className="text-sm text-quiet">Zatím žádné zprávy. Napište nám, na co se chcete zeptat.</p>
      ) : (
        <ul className="space-y-2">
          {messages.map((m) => (
            <li key={m.id} className={cn('flex', m.author === 'client' ? 'justify-end' : 'justify-start')}>
              <div className={cn('max-w-[85%] rounded-box px-4 py-2.5', m.author === 'client' ? 'bg-navy-700 text-white' : 'bg-navy-50 text-ink')}>
                <p className="whitespace-pre-wrap text-sm">{m.body}</p>
                <p className={cn('mt-1 text-[11px]', m.author === 'client' ? 'text-navy-200' : 'text-quiet')}>
                  {m.author === 'client' ? 'Vy' : 'My'} · {formatDateTime(m.createdAt)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={submit} className="space-y-2">
        <label htmlFor="portal-message" className="sr-only">Zpráva</label>
        <textarea
          id="portal-message"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={2000}
          rows={3}
          placeholder="Napište zprávu…"
          className="w-full rounded-chip border border-navy-100 bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-quiet focus:border-navy-400 focus:outline-none focus:ring-2 focus:ring-navy-100"
        />
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <button
          type="submit"
          disabled={pending || !body.trim()}
          className="inline-flex min-h-[44px] items-center rounded-chip bg-navy-700 px-5 text-sm font-semibold text-white hover:bg-navy-800 disabled:opacity-50"
        >
          Odeslat zprávu
        </button>
      </form>
    </div>
  )
}
