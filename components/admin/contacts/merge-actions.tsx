'use client'

import { useTransition } from 'react'
import { Merge, Undo2 } from 'lucide-react'
import { mergeDuplicate, undoMerge } from '@/app/contacts-actions'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'

/**
 * Sloučení duplicit (AD09). Nikdy se nedělá samo a nikdy se na nic neptá
 * dopředu: provede se hned a toast nabídne „Zpět" (AGENTS.md → B9). Může si
 * to dovolit, protože se při sloučení nic nemaže — jen se nastaví, kam
 * kontakt patří.
 */

export function MergeButton({
  sourceId,
  targetId,
  sourceName,
  targetName,
}: {
  sourceId: string
  targetId: string
  sourceName: string
  targetName: string
}) {
  const [pending, start] = useTransition()

  const undo = () =>
    start(async () => {
      const result = await undoMerge(sourceId)
      if (!result.ok) toast.error(result.error)
    })

  const merge = () =>
    start(async () => {
      const result = await mergeDuplicate(sourceId, targetId)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(`${sourceName} je teď součástí kontaktu ${targetName}.`, {
        description: 'Nic se nesmazalo — zakázky a hovory se jen počítají k jednomu člověku.',
        undo,
      })
    })

  return (
    <Button type="button" variant="outline" size="md" onClick={merge} disabled={pending} className="h-9 px-3.5 text-sm">
      <Merge size={14} strokeWidth={1.75} aria-hidden />
      Sloučit sem
    </Button>
  )
}

export function UnmergeButton({ sourceId, label = 'Rozdělit zpět' }: { sourceId: string; label?: string }) {
  const [pending, start] = useTransition()

  const split = () =>
    start(async () => {
      const result = await undoMerge(sourceId)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('Kontakt je zase samostatný.')
    })

  return (
    <Button type="button" variant="ghost" size="md" onClick={split} disabled={pending} className="h-9 px-3.5 text-sm">
      <Undo2 size={14} strokeWidth={1.75} aria-hidden />
      {label}
    </Button>
  )
}
