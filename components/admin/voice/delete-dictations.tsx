'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { countVoiceDictations, deleteVoiceDictations } from '@/app/voice-actions'
import type { DictationStatus } from '@/lib/admin/voice/labels'
import { formatDictations } from '@/lib/admin/voice/stats'

/**
 * Smazání diktátů (D-V7): jeden, nalezené, období nebo vše. Smazání nejde
 * vrátit (s diktátem zmizí i jeho opravy), proto se nejdřív zeptá — s počtem,
 * kolik jich opravdu zmizí, spočítaným na serveru těsně předtím.
 */

export type DeleteScopeInput =
  | { kind: 'one'; id: string }
  | { kind: 'range'; from: string; to: string }
  | { kind: 'search'; filter: { query: string | null; status: DictationStatus | null } }
  | { kind: 'all' }

export function DeleteDictationsButton({
  scope,
  label,
  variant = 'outline',
  disabled,
}: {
  scope: DeleteScopeInput
  label: string
  variant?: 'outline' | 'ghost'
  disabled?: boolean
}) {
  const router = useRouter()
  const [confirm, setConfirm] = useState<number | null>(null)
  const [pending, start] = useTransition()
  const trigger = useRef<HTMLButtonElement>(null)

  const ask = () =>
    start(async () => {
      if (scope.kind === 'one') {
        setConfirm(1)
        return
      }
      const res = await countVoiceDictations(scope)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      if (res.count === 0) {
        toast.info('Tady není co smazat.')
        return
      }
      setConfirm(res.count)
    })

  const close = () => {
    setConfirm(null)
    trigger.current?.focus()
  }

  const remove = () =>
    start(async () => {
      const res = await deleteVoiceDictations(scope)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setConfirm(null)
      toast.success(res.deleted === 1 ? 'Diktát je smazaný.' : `Smazáno: ${formatDictations(res.deleted)}.`)
      router.refresh()
    })

  if (confirm !== null) {
    return (
      <div
        role="group"
        aria-label="Potvrzení smazání"
        className="flex flex-wrap items-center gap-2 rounded-chip border border-danger/30 bg-danger/5 px-3 py-2"
        onKeyDown={(e) => {
          if (e.key === 'Escape') close()
        }}
      >
        <p className="text-sm text-ink">
          {confirm === 1 ? 'Smazat diktát?' : `Smazat ${formatDictations(confirm)}?`} Vrátit to nejde.
        </p>
        <Button type="button" variant="danger" onClick={remove} disabled={pending} autoFocus>
          Smazat
        </Button>
        <Button type="button" variant="ghost" onClick={close} disabled={pending}>
          Nechat
        </Button>
      </div>
    )
  }

  return (
    <Button ref={trigger} type="button" variant={variant} onClick={ask} disabled={pending || disabled}>
      <Trash2 size={16} strokeWidth={1.5} aria-hidden="true" />
      {label}
    </Button>
  )
}
