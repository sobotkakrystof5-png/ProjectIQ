'use client'

import { useState, useTransition, useRef } from 'react'
import { addClientMessage, deleteClientMessage } from '@/app/actions'
import { formatDate } from '@/lib/utils'
import { Trash2, Send, Loader2, MessageSquarePlus } from 'lucide-react'
import type { ClientMessage } from '@/lib/types'
import { cn } from '@/lib/utils'

interface Props {
  projectId: string
  publicToken: string
  messages: ClientMessage[]
}

export function ClientMessagesEditor({ projectId, publicToken, messages }: Props) {
  const [content, setContent] = useState('')
  const [isPending, startTransition] = useTransition()
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!content.trim()) return
    startTransition(async () => {
      await addClientMessage(projectId, publicToken, content)
      setContent('')
      textareaRef.current?.focus()
    })
  }

  function handleDelete(messageId: string) {
    setDeletingId(messageId)
    startTransition(async () => {
      await deleteClientMessage(messageId, projectId, publicToken)
      setDeletingId(null)
    })
  }

  return (
    <div className="space-y-5">
      {/* Existing messages */}
      {messages.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="w-10 h-10 rounded-full bg-navy-50 flex items-center justify-center mb-3">
            <MessageSquarePlus size={18} strokeWidth={1.5} className="text-navy-500" />
          </div>
          <p className="text-sm text-quiet">Zatím žádné zprávy.</p>
          <p className="text-xs text-quiet mt-0.5">Napiš první vzkaz klientovi níže.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {messages.map(msg => (
            <li
              key={msg.id}
              className="group flex items-start gap-3 bg-navy-50 border border-navy-100 rounded-chip px-4 py-3"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm text-ink leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                <p className="text-xs text-quiet mt-1.5">
                  {formatDate(msg.created_at)}
                </p>
              </div>
              <button
                onClick={() => handleDelete(msg.id)}
                disabled={isPending && deletingId === msg.id}
                className="mt-0.5 shrink-0 rounded-chip p-1.5 text-quiet opacity-0 transition-colors hover:bg-danger/5 hover:text-danger group-hover:opacity-100 disabled:opacity-30"
                title="Smazat zprávu"
              >
                {isPending && deletingId === msg.id
                  ? <Loader2 size={14} strokeWidth={1.5} className="animate-spin" />
                  : <Trash2 size={14} strokeWidth={1.5} />
                }
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Add new message */}
      <form onSubmit={handleAdd} className="flex flex-col gap-3 pt-1">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder="Napiš vzkaz klientovi — uvidí ho ve svém přehledu…"
          rows={3}
          className={cn(
            'w-full border border-navy-100 rounded-chip px-3 py-2.5 text-sm text-ink placeholder:text-quiet',
            'focus:outline-none focus:ring-2 focus:ring-navy-700 focus:border-transparent transition-shadow bg-surface resize-none'
          )}
        />
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isPending || !content.trim()}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-navy-700 px-5 text-[15px] font-semibold text-white transition-colors hover:bg-navy-800 disabled:opacity-40"
          >
            {isPending && !deletingId
              ? <Loader2 size={14} strokeWidth={1.5} className="animate-spin" />
              : <Send size={14} strokeWidth={1.5} />
            }
            Odeslat vzkaz
          </button>
        </div>
      </form>
    </div>
  )
}
