'use client'

import { useState, useTransition } from 'react'
import { deleteProject } from '@/app/actions'
import { Trash2, Loader2 } from 'lucide-react'

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
      className={`flex items-center gap-2 text-sm px-4 py-2 rounded-lg transition-colors ${
        confirm
          ? 'bg-red-600 text-white hover:bg-red-700'
          : 'text-red-500 border border-red-200 hover:bg-red-50'
      } disabled:opacity-50`}
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
