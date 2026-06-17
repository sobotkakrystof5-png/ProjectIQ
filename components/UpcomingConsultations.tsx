'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CalendarDays } from 'lucide-react'
import { CHANNEL_LABELS, type ConsultationChannel } from '@/lib/types'

export interface UpcomingConsultation {
  id: string
  scheduled_at: string | Date
  channel: ConsultationChannel
  client_wish: string
  meeting_link: string | null
  client_name: string
  project_id: string
  source?: string | null
}

const CHANNEL_BADGE: Record<ConsultationChannel, string> = {
  whatsapp: 'bg-green-50 text-green-700 ring-1 ring-green-200',
  teams:    'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  meet:     'bg-red-50 text-red-700 ring-1 ring-red-200',
  phone:    'bg-gray-50 text-gray-700 ring-1 ring-gray-200',
  other:    'bg-gray-50 text-gray-600 ring-1 ring-gray-200',
}

const VISIBLE_COUNT = 5

export function UpcomingConsultations({ consultations }: { consultations: UpcomingConsultation[] }) {
  const [showAll, setShowAll] = useState(false)

  if (consultations.length === 0) return null

  const visible = showAll ? consultations : consultations.slice(0, VISIBLE_COUNT)

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <CalendarDays size={16} strokeWidth={1.5} className="text-brand-700" />
        <h2 className="text-sm font-semibold text-foreground">Nadcházející konzultace</h2>
        <span className="ml-auto text-xs text-muted-foreground">{consultations.length} celkem</span>
      </div>

      <div className="flex flex-col gap-2">
        {visible.map(c => {
          const date = new Date(c.scheduled_at)
          const formattedDate = new Intl.DateTimeFormat('cs-CZ', {
            timeZone: 'Europe/Prague',
            weekday: 'short', day: 'numeric', month: 'short',
          }).format(date)
          const formattedHour = new Intl.DateTimeFormat('cs-CZ', {
            timeZone: 'Europe/Prague',
            hour: '2-digit', minute: '2-digit',
          }).format(date)

          return (
            <Link
              key={c.id}
              href={`/dashboard/${c.project_id}`}
              className="flex items-center gap-3 bg-white border border-border rounded-xl px-4 py-3 hover:border-brand-200 hover:bg-brand-50 transition-colors group"
            >
              <div className="brand-gradient w-12 h-12 rounded-lg flex flex-col items-center justify-center shrink-0 text-white">
                <span className="text-xs font-bold leading-tight">{formattedHour}</span>
                <span className="text-[10px] opacity-80 leading-tight">{formattedDate}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate group-hover:text-brand-800">
                  {c.client_name}
                </p>
                {c.source === 'vizeon' ? (
                  <span className="inline-block text-[10px] font-medium px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 ring-1 ring-violet-200 mt-0.5">
                    vizeon.cz
                  </span>
                ) : (
                  <span className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded mt-0.5 ${CHANNEL_BADGE[c.channel]}`}>
                    {CHANNEL_LABELS[c.channel]}
                  </span>
                )}
              </div>
            </Link>
          )
        })}
      </div>

      {consultations.length > VISIBLE_COUNT && (
        <button
          type="button"
          onClick={() => setShowAll(v => !v)}
          className="mt-2 text-xs text-brand-700 font-medium hover:underline"
        >
          {showAll ? 'Zobrazit méně' : `Zobrazit vše (${consultations.length - VISIBLE_COUNT} dalších)`}
        </button>
      )}
    </section>
  )
}
