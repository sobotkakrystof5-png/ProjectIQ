'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { UserRound } from 'lucide-react'
import { findContacts } from '@/app/contacts-actions'
import type { ContactSuggestion } from '@/lib/admin/contacts'
import { cn } from '@/lib/utils'

/**
 * Jméno s našeptávačem z Kontaktů (R-141). Píšete jméno, firmu, e-mail nebo
 * telefon; po výběru se vyplní jméno, telefon i e-mail najednou, takže se nic
 * neopisuje. Výsledky jsou pod polem v toku stránky (ne plovoucí vrstva),
 * aby je okno se scrollováním neořízlo.
 */
export function ContactPicker({
  value,
  onChange,
  onPick,
  className,
  placeholder = 'Jméno',
}: {
  value: string
  onChange: (value: string) => void
  onPick: (contact: ContactSuggestion) => void
  className?: string
  placeholder?: string
}) {
  const listId = useId()
  const [results, setResults] = useState<ContactSuggestion[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  // Po výběru se jméno změní programově — znovu hledat nemá smysl.
  const picked = useRef<string | null>(null)

  useEffect(() => {
    const q = value.trim()
    if (q.length < 2 || picked.current === value) {
      setResults([])
      return
    }
    let alive = true
    const timer = setTimeout(() => {
      findContacts(q)
        .then((rows) => {
          if (!alive) return
          setResults(rows)
          setActive(-1)
          setOpen(rows.length > 0)
        })
        .catch((err: unknown) => {
          // Bez našeptávače jde údaje vyplnit ručně; okno kvůli tomu nepadá.
          console.error('[kontakty] našeptávač se nenačetl', err)
          if (alive) setResults([])
        })
    }, 250)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [value])

  const pick = (c: ContactSuggestion) => {
    picked.current = c.name
    onPick(c)
    setOpen(false)
    setResults([])
  }

  const showList = open && results.length > 0

  return (
    <div className="flex flex-col gap-1">
      <input
        type="text"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
        value={value}
        onChange={(e) => {
          picked.current = null
          onChange(e.target.value)
        }}
        onKeyDown={(e) => {
          if (!showList) return
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActive((i) => (i + 1) % results.length)
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((i) => (i <= 0 ? results.length - 1 : i - 1))
          } else if (e.key === 'Enter' && active >= 0) {
            e.preventDefault()
            pick(results[active])
          } else if (e.key === 'Escape') {
            // Zavře jen našeptávač; okno ho nechá být díky `keepDialogForPicker`.
            e.preventDefault()
            setOpen(false)
          }
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder={placeholder}
        maxLength={120}
        autoComplete="off"
        className={className}
      />
      {showList && (
        <ul id={listId} role="listbox" aria-label="Kontakty" className="flex flex-col overflow-hidden rounded-chip border border-navy-100 bg-surface">
          {results.map((c, i) => (
            <li key={c.id} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                tabIndex={-1}
                // mousedown před blur pole, jinak by se seznam zavřel dřív, než klik dorazí.
                onMouseDown={(e) => {
                  e.preventDefault()
                  pick(c)
                }}
                className={cn(
                  'flex min-h-11 w-full items-center gap-2.5 px-3 py-1.5 text-left hover:bg-navy-50',
                  i === active && 'bg-navy-50',
                )}
              >
                <UserRound size={16} strokeWidth={1.5} aria-hidden="true" className="shrink-0 text-quiet" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">
                    {c.name}
                    {c.company && c.company !== c.name ? <span className="font-normal text-quiet"> · {c.company}</span> : null}
                  </span>
                  <span className="block truncate text-xs text-quiet">
                    {[c.phone, c.email].filter(Boolean).join(' · ') || 'Bez telefonu a e-mailu'}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * Pro `onEscapeKeyDown` dialogu: Escape v otevřeném našeptávači zavře jen
 * seznam. Radix čte Escape dřív než pole (zachycení na dokumentu).
 */
export function keepDialogForPicker(event: KeyboardEvent): void {
  const target = event.target as HTMLElement | null
  if (target?.getAttribute('role') === 'combobox' && target.getAttribute('aria-expanded') === 'true') event.preventDefault()
}
