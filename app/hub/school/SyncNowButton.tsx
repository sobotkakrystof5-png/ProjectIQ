'use client'

import { useState } from 'react'
import { RefreshCw } from 'lucide-react'

export function SyncNowButton() {
  const [state, setState] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')

  async function handleSync() {
    setState('loading')
    try {
      const res = await fetch('/api/school/sync', { method: 'POST' })
      setState(res.ok ? 'ok' : 'error')
    } catch {
      setState('error')
    } finally {
      setTimeout(() => setState('idle'), 3000)
    }
  }

  const label =
    state === 'loading' ? 'Synchronizuji…' :
    state === 'ok'      ? 'Hotovo' :
    state === 'error'   ? 'Chyba' :
    'Sync now'

  const cls =
    state === 'ok'    ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
    state === 'error' ? 'bg-red-50 text-red-700 border-red-200' :
    'bg-white text-foreground border-border hover:bg-slate-50'

  return (
    <button
      onClick={handleSync}
      disabled={state === 'loading'}
      className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${cls}`}
    >
      <RefreshCw size={13} strokeWidth={1.5} className={state === 'loading' ? 'animate-spin' : ''} />
      {label}
    </button>
  )
}
