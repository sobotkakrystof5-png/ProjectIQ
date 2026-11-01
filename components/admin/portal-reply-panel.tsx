'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { replyToClient } from '@/app/portal-admin-actions'
import { cn, formatDateTime } from '@/lib/utils'

export interface PortalThreadMessage {
  id: string
  author: 'client' | 'admin'
  body: string
  createdAt: string
}

/** Vlákno zpráv s klientem v jeho prostoru; odpověď se mu ukáže na /klient. */
export function PortalReplyPanel({ projectId, messages }: { projectId: string; messages: PortalThreadMessage[] }) {
  const router = useRouter()
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    start(async () => {
      const res = await replyToClient(projectId, body)
      if (!res.success) setError(res.error)
      else {
        setBody('')
        router.refresh()
      }
    })
  }

  return (
    <div className="space-y-4">
      {messages.length === 0 ? (
        <p className="text-sm text-muted-foreground">Klient zatím nepsal. Můžete mu napsat první.</p>
      ) : (
        <ul className="space-y-2">
          {messages.map((m) => (
            <li key={m.id} className={cn('flex', m.author === 'admin' ? 'justify-end' : 'justify-start')}>
              <div className={cn('max-w-[85%] rounded-xl px-4 py-2.5', m.author === 'admin' ? 'bg-brand-50' : 'border border-border bg-white')}>
                <p className="whitespace-pre-wrap text-sm text-foreground">{m.body}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {m.author === 'admin' ? 'Vy' : 'Klient'} · {formatDateTime(m.createdAt)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={submit} className="space-y-2">
        <label htmlFor="portal-reply" className="sr-only">Odpověď klientovi</label>
        <textarea
          id="portal-reply"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={2000}
          rows={3}
          placeholder="Odpověď klientovi…"
          className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={pending || !body.trim()} className="inline-flex min-h-[44px] items-center rounded-lg bg-brand-700 px-4 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50">
          Odeslat do klientského prostoru
        </button>
      </form>
    </div>
  )
}
