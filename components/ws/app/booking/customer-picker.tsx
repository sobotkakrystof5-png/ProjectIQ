'use client'

import { useEffect, useRef, useState } from 'react'
import { UserRound, X } from 'lucide-react'
import { searchCustomers } from '@/app/w/[business]/poptavky/actions'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { CustomerOption } from '@/lib/ws/calendar'
import { formatPhone } from '@/lib/ws/format-phone'

/**
 * Zákazník do rezervace: píšete jméno (nebo telefon), pod polem se ukážou
 * stálí zákazníci. Klik vybere existujícího, bez výběru se založí nový podle
 * napsaného jména. Hledání jde přes `searchCustomers` (jen zákazníci účtu).
 */
export function CustomerPicker({
  slug,
  id,
  text,
  picked,
  onText,
  onPick,
  autoFocus,
}: {
  slug: string
  id: string
  text: string
  picked: CustomerOption | null
  onText: (value: string) => void
  onPick: (customer: CustomerOption | null) => void
  autoFocus?: boolean
}) {
  const [options, setOptions] = useState<CustomerOption[]>([])
  const latest = useRef('')

  useEffect(() => {
    const query = text.trim()
    latest.current = query
    if (picked || query.length < 2) {
      setOptions([])
      return
    }
    const timer = setTimeout(async () => {
      try {
        const res = await searchCustomers({ slug, query })
        if (latest.current === query) setOptions(res.ok ? res.data : [])
      } catch {
        if (latest.current === query) setOptions([])
      }
    }, 200)
    return () => clearTimeout(timer)
  }, [text, picked, slug])

  if (picked) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink">Zákazník</span>
        <div className="flex min-h-11 items-center gap-2 rounded-chip border border-input bg-navy-50 px-3 dark:bg-navy-900">
          <UserRound aria-hidden size={18} strokeWidth={1.5} className="shrink-0 text-quiet" />
          <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">
            {picked.name}
            {(picked.phone || picked.email) && (
              <span className="ml-2 font-num text-xs font-normal text-quiet">{picked.phone ? formatPhone(picked.phone) : picked.email}</span>
            )}
          </span>
          <button
            type="button"
            onClick={() => {
              onPick(null)
              onText(picked.name)
            }}
            aria-label="Vybrat jiného zákazníka"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-quiet hover:bg-accent hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X aria-hidden size={16} strokeWidth={1.5} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>Zákazník</Label>
      <Input
        id={id}
        value={text}
        onChange={(e) => onText(e.target.value)}
        maxLength={120}
        autoComplete="off"
        autoFocus={autoFocus}
        placeholder="Jméno nebo telefon"
      />
      {options.length > 0 && (
        <ul className="flex flex-col overflow-hidden rounded-chip border bg-surface" aria-label="Zákazníci, které už znáte">
          {options.slice(0, 4).map((c) => (
            <li key={c.id} className="border-b last:border-b-0">
              <button
                type="button"
                onClick={() => onPick(c)}
                className="flex min-h-11 w-full items-center justify-between gap-3 px-3 text-left text-[15px] hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
              >
                <span className="truncate font-semibold text-ink">{c.name}</span>
                <span className="shrink-0 font-num text-xs text-quiet">{c.phone ? formatPhone(c.phone) : (c.email ?? '')}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
