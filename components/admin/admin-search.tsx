'use client'

import { useCallback, useEffect, useId, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Sparkles } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { searchAdmin } from '@/app/admin-search-actions'
import { allNavItems } from '@/lib/admin-nav'
import {
  SEARCH_KIND_LABELS,
  SEARCH_MIN_CHARS,
  filterPages,
  type SearchHit,
  type SearchKind,
} from '@/lib/admin-search'
import { openAssistant } from '@/lib/admin/assistant-open'
import { cn } from '@/lib/utils'

const ORDER: SearchKind[] = ['page', 'project', 'lead', 'invoice']

/** Hledání ⌘K / Ctrl+K: stránky, zakázky, hovory a faktury. Enter nebo klik = přechod. */
export function AdminSearch({ className }: { className?: string }) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [remote, setRemote] = useState<SearchHit[]>([])
  const [active, setActive] = useState(0)
  const [, startTransition] = useTransition()

  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
    setRemote([])
    setActive(0)
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
      } else if (e.key === 'Escape') {
        close()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (query.trim().length < SEARCH_MIN_CHARS) return
    let cancelled = false
    const timer = setTimeout(() => {
      startTransition(async () => {
        const hits = await searchAdmin(query)
        if (!cancelled) setRemote(hits)
      })
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query])

  const shown = query.trim().length >= SEARCH_MIN_CHARS ? remote : []
  const pages = filterPages(allNavItems(), query)
  const hits = [...pages, ...shown].sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind))

  function go(hit: SearchHit) {
    close()
    router.push(hit.href)
  }

  /**
   * Když hledání nic nenajde, nabídne se asistent (AD14). Je to nejčastější
   * okamžik, kdy člověk ⌘K nepoužil k hledání, ale napsal, co chce udělat —
   * „zavolat Nováka ve čtvrtek" žádnou stránku nenajde.
   */
  function askAssistant() {
    const sentence = query.trim()
    close()
    openAssistant(sentence)
  }

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, Math.max(hits.length - 1, 0)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (hits[active]) go(hits[active])
      else if (query.trim().length >= SEARCH_MIN_CHARS) askAssistant()
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Hledat (Ctrl+K)"
        className={cn(
          'flex min-h-[44px] items-center gap-2 rounded-chip border border-navy-100 bg-surface px-3 text-sm text-quiet hover:border-navy-300',
          className,
        )}
      >
        <Search size={16} strokeWidth={1.5} aria-hidden="true" />
        <span className="hidden sm:inline">Hledat</span>
        <kbd className="ml-auto hidden rounded border border-navy-100 px-1.5 font-num text-[11px] text-quiet lg:inline">⌘K</kbd>
      </button>

      <Dialog open={open} onOpenChange={(v) => { if (!v) close() }}>
        <DialogContent className="top-[12vh] bottom-auto max-w-lg gap-0 overflow-hidden p-0 [&>button]:hidden">
          <DialogHeader className="sr-only">
            <DialogTitle>Hledání</DialogTitle>
            <DialogDescription>Zakázky, kontakty, faktury a stránky administrace</DialogDescription>
          </DialogHeader>
        <div className="flex items-center gap-2 border-b border-navy-100 px-4">
            <Search size={16} strokeWidth={1.5} className="text-quiet" aria-hidden="true" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setActive(0)
                if (e.target.value.trim().length < SEARCH_MIN_CHARS) setRemote([])
              }}
              onKeyDown={onInputKey}
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-activedescendant={hits[active] ? `${listId}-${active}` : undefined}
              placeholder="Zakázka, klient, faktura nebo stránka…"
              className="h-12 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-quiet"
            />
          </div>
          <ul id={listId} role="listbox" className="max-h-[50vh] overflow-y-auto p-2">
            {query.trim().length < SEARCH_MIN_CHARS ? (
              <li className="px-3 py-6 text-center text-sm text-quiet">Napište aspoň dvě písmena.</li>
            ) : hits.length === 0 ? (
              <li>
                <p className="px-3 pb-3 pt-6 text-center text-sm text-quiet">Nic jsme nenašli.</p>
                <button
                  type="button"
                  onClick={askAssistant}
                  className="flex min-h-[44px] w-full items-center gap-3 rounded-chip px-3 py-2 text-left hover:bg-navy-50"
                >
                  <Sparkles size={16} strokeWidth={1.5} className="shrink-0 text-quiet" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-ink">Zeptat se asistenta</span>
                    <span className="block truncate text-xs text-quiet">
                      Připraví návrh. Nic se neprovede bez vašeho kliknutí.
                    </span>
                  </span>
                </button>
              </li>
            ) : (
              hits.map((hit, i) => (
                <li
                  key={`${hit.kind}-${hit.id}`}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(hit)}
                  className={cn(
                    'flex min-h-[44px] cursor-pointer items-center gap-3 rounded-chip px-3 py-2',
                    i === active ? 'bg-navy-50' : '',
                  )}
                >
                  <span className="w-24 shrink-0 text-[11px] font-semibold uppercase tracking-wider text-quiet">
                    {SEARCH_KIND_LABELS[hit.kind]}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-ink">{hit.title}</span>
                    {hit.subtitle && <span className="block truncate text-xs text-quiet">{hit.subtitle}</span>}
                  </span>
                </li>
              ))
            )}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  )
}
