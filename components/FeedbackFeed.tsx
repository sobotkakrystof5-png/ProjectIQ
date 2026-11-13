import { MessageSquareQuote } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { ClientFeedback } from '@/lib/types'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { toneVariant } from '@/lib/admin-status'

interface FeedbackFeedProps {
  feedbacks: ClientFeedback[]
  clientName: string
}

/** Hodnocení je stav, ne kategorie — pět tónů adminu (R-091), ne vlastní paleta. */
function npsStyle(nps: number): { tone: BadgeProps['variant']; label: string } {
  if (nps >= 9) return { tone: toneVariant('success'), label: 'Promotér' }
  if (nps >= 7) return { tone: toneVariant('neutral'), label: 'Pasivní' }
  return { tone: toneVariant('danger'), label: 'Kritik' }
}

export function FeedbackFeed({ feedbacks, clientName }: FeedbackFeedProps) {
  if (feedbacks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <div className="w-10 h-10 rounded-full bg-navy-50 flex items-center justify-center mb-3">
          <MessageSquareQuote size={18} strokeWidth={1.5} className="text-navy-400" />
        </div>
        <p className="text-sm text-quiet">Zatím žádná zpětná vazba.</p>
        <p className="text-xs text-quiet mt-0.5">
          Klient ji odešle přes klientský portál.
        </p>
      </div>
    )
  }

  return (
    <ul className="space-y-3">
      {feedbacks.map(fb => {
        const { tone, label } = npsStyle(fb.nps)
        return (
          <li key={fb.id} className="bg-surface border border-navy-100 rounded-chip p-4">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-ink">{clientName}</span>
                <Badge variant={tone}>
                  <span className="font-num">NPS {fb.nps}/10</span> · {label}
                </Badge>
              </div>
              <span className="shrink-0 font-num text-xs text-quiet">{formatDate(fb.created_at)}</span>
            </div>
            {fb.content && (
              <p className="text-sm text-ink leading-relaxed whitespace-pre-wrap">{fb.content}</p>
            )}
            {!fb.content && (
              <p className="text-sm text-quiet italic">Bez komentáře</p>
            )}
          </li>
        )
      })}
    </ul>
  )
}
