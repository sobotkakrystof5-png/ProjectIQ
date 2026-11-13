'use client'

import { useState, useTransition } from 'react'
import { BrainCircuit, Check, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { confirmMemoryRow, discardMemoryRow, rememberFact } from '@/app/memory-actions'
import { MEMORY_KINDS, MEMORY_KIND_LABELS, MEMORY_TEXT_MAX, type MemoryKind, type MemoryScope } from '@/lib/admin/memory/types'

/**
 * Ovládání paměti (AD15). Zapsat, potvrdit návrh, zahodit.
 *
 * Potvrzení a zahození se neptají dopředu — zahození jde vzít zpět tím, že
 * se věta napíše znovu, a potvrzení „Rozmyslet si to" taky (zahodit).
 * Zapisuje se vždy na klik, nikdy při psaní.
 */

export function AddMemoryForm({ scope, refId }: { scope: MemoryScope; refId: string | null }) {
  const [text, setText] = useState('')
  const [kind, setKind] = useState<MemoryKind>('preference')
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()

  const save = () =>
    start(async () => {
      const result = await rememberFact({ scope, refId, kind, text })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setText('')
      setOpen(false)
      toast.success('Zapsáno do paměti.')
    })

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        className="min-h-11 w-fit px-4 text-sm"
      >
        <BrainCircuit size={15} strokeWidth={1.75} aria-hidden />
        Uložit do paměti
      </Button>
    )
  }

  return (
    <div className="flex flex-col gap-3 rounded-box border border-navy-100 bg-surface p-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink">Co si má systém pamatovat</span>
        <textarea
          autoFocus
          rows={3}
          value={text}
          maxLength={MEMORY_TEXT_MAX}
          onChange={(e) => setText(e.target.value)}
          placeholder="Třeba: Faktury chce vždycky na firmu, ne na jméno."
          className="w-full rounded-box border border-input bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-navy-400"
        />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm text-quiet">
          Druh
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as MemoryKind)}
            className="min-h-11 rounded-box border border-input bg-surface px-3 text-sm text-ink"
          >
            {MEMORY_KINDS.map((value) => (
              <option key={value} value={value}>
                {MEMORY_KIND_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <div className="ml-auto flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setOpen(false)
              setText('')
            }}
            disabled={pending}
            className="min-h-11 px-4 text-sm"
          >
            Zrušit
          </Button>
          <Button type="button" onClick={save} disabled={pending || text.trim() === ''} className="min-h-11 px-4 text-sm">
            Uložit
          </Button>
        </div>
      </div>
      <p className="text-xs text-quiet">
        Klíče, hesla ani cesty k souborům sem nepatří — uložení je odmítne.
      </p>
    </div>
  )
}

export function DraftControls({
  id,
  scope,
  refId,
}: {
  id: string
  scope: MemoryScope
  refId: string | null
}) {
  const [pending, start] = useTransition()

  const confirm = () =>
    start(async () => {
      const result = await confirmMemoryRow(id, scope, refId)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('Potvrzeno. Systém s tím od teď počítá.')
    })

  const discard = () =>
    start(async () => {
      const result = await discardMemoryRow(id, scope, refId)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('Zahozeno.')
    })

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <Button type="button" variant="outline" onClick={confirm} disabled={pending} className="min-h-11 px-3 text-sm">
        <Check size={14} strokeWidth={1.75} aria-hidden />
        Potvrdit
      </Button>
      <Button type="button" variant="ghost" onClick={discard} disabled={pending} className="min-h-11 px-3 text-sm">
        <Trash2 size={14} strokeWidth={1.75} aria-hidden />
        Zahodit
      </Button>
    </div>
  )
}

export function DraftBadge() {
  return <Badge variant="signal">Návrh paměti</Badge>
}

export function ForgetButton({ id, scope, refId }: { id: string; scope: MemoryScope; refId: string | null }) {
  const [pending, start] = useTransition()
  const forget = () =>
    start(async () => {
      const result = await discardMemoryRow(id, scope, refId)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('Zapomenuto.')
    })

  return (
    <Button
      type="button"
      variant="ghost"
      onClick={forget}
      disabled={pending}
      aria-label="Zapomenout tuhle poznámku"
      className="min-h-11 shrink-0 px-3 text-sm"
    >
      <Trash2 size={14} strokeWidth={1.75} aria-hidden />
    </Button>
  )
}
