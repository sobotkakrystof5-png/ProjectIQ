'use client'

import { toast as sonner } from 'sonner'
import { AlertCircle, Check } from 'lucide-react'
import { cn } from '@/lib/ws/utils'
import { wsFontVariables } from '@/lib/ws/fonts'

// Toasty Workspace jdou přes jediný <Toaster> v kořenovém app/layout.tsx (sonner 1.x neumí
// víc toasterů). Ten leží mimo [data-app="ws"], proto si toast nese vlastní kořen s tokeny
// a písmy (R-027). Téma nastavuje WsRoot.

type Theme = 'light' | 'dark'
let currentTheme: Theme = 'light'

export function setToastTheme(theme: Theme) {
  currentTheme = theme
}

type Tone = 'neutral' | 'success' | 'error'

export type ToastOptions = {
  description?: string
  /** Místo potvrzovacích dialogů: akce se provede hned a toast nabídne „Zpět" (AGENTS.md → B9). */
  undo?: () => void
  undoLabel?: string
  duration?: number
}

function show(tone: Tone, title: string, opts: ToastOptions = {}) {
  return sonner.custom(
    (id) => (
      <div
        data-app="ws"
        data-theme={currentTheme}
        className={cn(wsFontVariables, 'rounded-chip')}
        style={{ background: 'transparent' }}
      >
        <div
          role={tone === 'error' ? 'alert' : 'status'}
          className="flex w-[356px] max-w-[calc(100vw-32px)] items-start gap-3 rounded-chip border bg-surface p-4 text-ink shadow-lg shadow-navy-950/10"
        >
          {tone !== 'neutral' && (
            <span
              className={cn(
                'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
                tone === 'success' ? 'bg-navy-700 text-white' : 'bg-danger text-white',
              )}
              aria-hidden
            >
              {tone === 'success' ? <Check size={13} strokeWidth={2} /> : <AlertCircle size={13} strokeWidth={2} />}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-5">{title}</p>
            {opts.description && <p className="mt-0.5 text-sm leading-5 text-quiet">{opts.description}</p>}
          </div>
          {opts.undo && (
            <button
              type="button"
              onClick={() => {
                opts.undo?.()
                sonner.dismiss(id)
              }}
              className="-my-1 shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold text-navy-700 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-navy-200"
            >
              {opts.undoLabel ?? 'Zpět'}
            </button>
          )}
        </div>
      </div>
    ),
    { duration: opts.duration ?? (opts.undo ? 6000 : 4000) },
  )
}

export const toast = {
  message: (title: string, opts?: ToastOptions) => show('neutral', title, opts),
  success: (title: string, opts?: ToastOptions) => show('success', title, opts),
  error: (title: string, opts?: ToastOptions) => show('error', title, opts),
  dismiss: (id?: string | number) => sonner.dismiss(id),
}
