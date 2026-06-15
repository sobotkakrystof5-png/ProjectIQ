import { MessageSquareQuote } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { ClientFeedback } from '@/lib/types'

interface FeedbackFeedProps {
  feedbacks: ClientFeedback[]
  clientName: string
}

function npsStyle(nps: number): { badge: string; label: string } {
  if (nps >= 9) return { badge: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200', label: 'Promotér' }
  if (nps >= 7) return { badge: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200', label: 'Pasivní' }
  return { badge: 'bg-red-50 text-red-700 ring-1 ring-red-200', label: 'Kritik' }
}

export function FeedbackFeed({ feedbacks, clientName }: FeedbackFeedProps) {
  if (feedbacks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <div className="w-10 h-10 rounded-full bg-brand-50 flex items-center justify-center mb-3">
          <MessageSquareQuote size={18} strokeWidth={1.5} className="text-brand-400" />
        </div>
        <p className="text-sm text-muted-foreground">Zatím žádná zpětná vazba.</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Klient ji odešle přes klientský portál.
        </p>
      </div>
    )
  }

  return (
    <ul className="space-y-3">
      {feedbacks.map(fb => {
        const { badge, label } = npsStyle(fb.nps)
        return (
          <li key={fb.id} className="bg-white border border-border rounded-xl p-4">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-foreground">{clientName}</span>
                <span className={cn('text-xs font-semibold rounded-full px-2.5 py-0.5', badge)}>
                  NPS {fb.nps}/10 · {label}
                </span>
              </div>
              <span className="text-xs text-muted-foreground shrink-0">{formatDate(fb.created_at)}</span>
            </div>
            {fb.content && (
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{fb.content}</p>
            )}
            {!fb.content && (
              <p className="text-sm text-muted-foreground italic">Bez komentáře</p>
            )}
          </li>
        )
      })}
    </ul>
  )
}
