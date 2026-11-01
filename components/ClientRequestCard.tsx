'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Check, ChevronDown, Copy, Mic, RotateCcw, X } from 'lucide-react'
import { setClientRequestStatus } from '@/app/client-requests-actions'
import { REQUEST_KIND_LABELS, type RequestKind } from '@/lib/client-requests'
import { cn, formatDateTime } from '@/lib/utils'

export interface ClientRequestCardData {
  id: string
  clientName: string
  projectHref: string
  businessLabel: string
  source: 'text' | 'voice'
  status: 'new' | 'done' | 'dismissed'
  aiStatus: 'pending' | 'ready' | 'failed'
  kind: RequestKind | null
  summary: string | null
  unclear: string | null
  rawText: string
  createdAt: string
  /** Hotové zadání pro Claude Code, složené na serveru. */
  prompt: string
  /** Příkaz pro terminál, který otevře Claude Code se zadáním (úroveň 2, KP09), složený na serveru. */
  terminalCommand?: string
}

export function ClientRequestCard({ request }: { request: ClientRequestCardData }) {
  const [copied, setCopied] = useState(false)
  const [showRaw, setShowRaw] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const open = request.status === 'new'

  const [copiedCommand, setCopiedCommand] = useState(false)

  async function copyCommand() {
    if (!request.terminalCommand) return
    try {
      await navigator.clipboard.writeText(request.terminalCommand)
      setCopiedCommand(true)
      setTimeout(() => setCopiedCommand(false), 2000)
    } catch {
      setError('Kopírování se nepovedlo, označte text ručně.')
    }
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(request.prompt)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Kopírování se nepovedlo, označte text ručně.')
    }
  }

  function changeStatus(status: 'new' | 'done' | 'dismissed') {
    setError(null)
    startTransition(async () => {
      const res = await setClientRequestStatus(request.id, status)
      if (!res.success) setError(res.error ?? 'Změna se nepovedla.')
    })
  }

  return (
    <article className={cn('rounded-xl border border-border bg-white p-4 shadow-sm', !open && 'opacity-70')}>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Link href={request.projectHref} className="text-sm font-semibold text-foreground hover:underline">
          {request.clientName}
        </Link>
        <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700">
          {request.businessLabel}
        </span>
        {request.kind && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {REQUEST_KIND_LABELS[request.kind]}
          </span>
        )}
        {request.source === 'voice' && (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Mic size={11} strokeWidth={1.5} /> hlasem
          </span>
        )}
        <time className="ml-auto text-xs text-muted-foreground">{formatDateTime(request.createdAt)}</time>
      </header>

      <div className="mt-3 space-y-2">
        {request.summary ? (
          <p className="text-sm leading-relaxed text-foreground">{request.summary}</p>
        ) : (
          <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
            {request.aiStatus === 'pending' ? 'Shrnutí se připravuje, mezitím je tady původní text:\n\n' : ''}
            {request.rawText}
          </p>
        )}
        {request.unclear && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
            <strong className="font-semibold">Nejasné, zeptejte se klienta:</strong> {request.unclear}
          </p>
        )}
        {request.aiStatus === 'failed' && (
          <p className="text-xs text-muted-foreground">Shrnutí se nepodařilo vytvořit, zadání vychází z původního textu.</p>
        )}
      </div>

      <button
        type="button"
        onClick={() => setShowRaw(v => !v)}
        className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        aria-expanded={showRaw}
      >
        <ChevronDown size={12} strokeWidth={1.5} className={cn('transition-transform', showRaw && 'rotate-180')} />
        Původní text a zadání pro Claude Code
      </button>
      {showRaw && (
        <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-muted/60 p-3 text-xs leading-relaxed text-foreground">
          {request.prompt}
        </pre>
      )}

      {error && (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {error}
        </p>
      )}

      <footer className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={copyPrompt}
          className="inline-flex min-h-[40px] items-center gap-2 rounded-lg brand-gradient px-3.5 text-sm font-medium text-white shadow-sm hover:opacity-90"
        >
          {copied ? <Check size={14} strokeWidth={1.5} /> : <Copy size={14} strokeWidth={1.5} />}
          {copied ? 'Zkopírováno' : 'Kopírovat zadání'}
        </button>
        {request.terminalCommand && (
          <button
            type="button"
            onClick={copyCommand}
            title="Spusťte v repozitáři projektu. Zadání si nejdřív přečtěte."
            className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-border px-3.5 text-sm font-medium text-foreground hover:bg-brand-50"
          >
            {copiedCommand ? <Check size={14} strokeWidth={1.5} /> : <Copy size={14} strokeWidth={1.5} />}
            {copiedCommand ? 'Zkopírováno' : 'Příkaz pro terminál'}
          </button>
        )}
        {open ? (
          <>
            <button
              type="button"
              disabled={isPending}
              onClick={() => changeStatus('done')}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-foreground hover:bg-brand-50 disabled:opacity-60"
            >
              <Check size={14} strokeWidth={1.5} /> Hotovo
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => changeStatus('dismissed')}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-3 text-sm text-muted-foreground hover:text-foreground disabled:opacity-60"
            >
              <X size={14} strokeWidth={1.5} /> Zahodit
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={isPending}
            onClick={() => changeStatus('new')}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-foreground hover:bg-brand-50 disabled:opacity-60"
          >
            <RotateCcw size={14} strokeWidth={1.5} /> Vrátit mezi nové
          </button>
        )}
      </footer>
    </article>
  )
}
