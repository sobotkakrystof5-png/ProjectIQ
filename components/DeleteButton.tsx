'use client'

import { useState, useTransition } from 'react'
import { deleteProject } from '@/app/actions'
import { Trash2, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DeleteButtonProps {
  projectId: string
}

export function DeleteButton({ projectId }: DeleteButtonProps) {
  const [confirm, setConfirm] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleDelete() {
    if (!confirm) {
      setConfirm(true)
      setTimeout(() => setConfirm(false), 3000)
      return
    }
    startTransition(async () => {
      await deleteProject(projectId)
    })
  }

  return (
    <button
      onClick={handleDelete}
      disabled={isPending}
      className={cn(
        'inline-flex min-h-11 items-center gap-2 rounded-full px-5 text-[15px] font-semibold transition-colors disabled:opacity-50',
        confirm ? 'bg-danger text-white hover:bg-danger/90' : 'border border-danger/30 text-danger hover:bg-danger/5',
      )}
    >
      {isPending ? (
        <Loader2 size={14} strokeWidth={1.5} className="animate-spin" />
      ) : (
        <Trash2 size={14} strokeWidth={1.5} />
      )}
      {confirm ? 'Opravdu smazat?' : 'Smazat zakázku'}
    </button>
  )
}
