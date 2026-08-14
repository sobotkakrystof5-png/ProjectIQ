'use client'

import { useState } from 'react'
import { Mail, Phone, Calendar, Briefcase, MessageSquare, CheckCircle, Trash2, Loader2 } from 'lucide-react'
import {
  confirmVizeonBooking, deleteVizeonBooking,
  confirmAltenoBooking, deleteAltenoBooking,
} from '@/app/actions'
import { BUSINESSES, type Business } from '@/lib/business'

export interface WebBooking {
  id: string
  client_name: string
  client_email: string | null
  client_phone: string | null
  service_type: string | null
  description: string | null
  created_at: string
  consultation_at: string | null
}

// Server actions se nedají poslat přes props ze server komponenty jako hodnota
// vybraná za běhu, takže se dvojice akcí vybírá tady podle byznysu.
const ACTIONS: Record<Business, { confirm: (id: string) => Promise<void>; remove: (id: string) => Promise<void> }> = {
  vizeon: { confirm: confirmVizeonBooking, remove: deleteVizeonBooking },
  alteno: { confirm: confirmAltenoBooking, remove: deleteAltenoBooking },
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleString('cs-CZ', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Prague',
  })
}

function formatCreated(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('cs-CZ', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Prague',
  })
}

interface Props {
  booking: WebBooking
  business: Business
}

export function BookingCard({ booking, business }: Props) {
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const cfg = BUSINESSES[business]
  const actions = ACTIONS[business]
  const isAlteno = business === 'alteno'

  async function handleConfirm() {
    if (confirming) return
    setConfirming(true)
    try {
      await actions.confirm(booking.id)
    } catch {
      setConfirming(false)
    }
  }

  async function handleDelete() {
    if (deleting) return
    if (!confirm(`Opravdu smazat rezervaci od ${booking.client_name}?`)) return
    setDeleting(true)
    try {
      await actions.remove(booking.id)
    } catch {
      setDeleting(false)
    }
  }

  const iconCls = isAlteno ? 'shrink-0 text-amber-500' : 'shrink-0 text-brand-400'
  const linkCls = isAlteno ? 'hover:text-amber-700 transition-colors' : 'hover:text-brand-800 transition-colors'

  return (
    <div className="bg-white border border-border rounded-xl p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-foreground text-base">{booking.client_name}</h3>
            <span
              className={
                'inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ' +
                (isAlteno
                  ? 'bg-amber-50 text-amber-700 border border-amber-100'
                  : 'bg-blue-50 text-blue-700 border border-blue-100')
              }
            >
              {cfg.domain}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">Poptávka přijata {formatCreated(booking.created_at)}</p>
        </div>
        <button
          onClick={handleDelete}
          disabled={deleting || confirming}
          className="p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40"
          title="Smazat rezervaci"
        >
          {deleting ? <Loader2 size={16} strokeWidth={1.5} className="animate-spin" /> : <Trash2 size={16} strokeWidth={1.5} />}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
        {booking.client_email && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Mail size={14} strokeWidth={1.5} className={iconCls} />
            <a href={`mailto:${booking.client_email}`} className={`${linkCls} truncate`}>
              {booking.client_email}
            </a>
          </div>
        )}
        {booking.client_phone && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Phone size={14} strokeWidth={1.5} className={iconCls} />
            <a href={`tel:${booking.client_phone}`} className={linkCls}>
              {booking.client_phone}
            </a>
          </div>
        )}
        {booking.service_type && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Briefcase size={14} strokeWidth={1.5} className={iconCls} />
            <span>{booking.service_type}</span>
          </div>
        )}
        {booking.consultation_at && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar size={14} strokeWidth={1.5} className={iconCls} />
            <span>Konzultace: {formatDate(booking.consultation_at)}</span>
          </div>
        )}
      </div>

      {booking.description && (
        <div className="flex items-start gap-2 text-sm text-muted-foreground bg-muted/30 rounded-lg p-3">
          <MessageSquare size={14} strokeWidth={1.5} className={`mt-0.5 ${iconCls}`} />
          <p className="leading-relaxed">{booking.description}</p>
        </div>
      )}

      <div className="pt-1">
        <button
          onClick={handleConfirm}
          disabled={confirming || deleting}
          className={
            'flex items-center gap-2 text-white text-sm font-medium px-4 py-2.5 rounded-lg shadow-sm hover:opacity-90 transition-opacity disabled:opacity-60 ' +
            (isAlteno ? 'bg-gradient-to-br from-amber-500 to-orange-600' : 'brand-gradient')
          }
        >
          {confirming ? (
            <Loader2 size={15} strokeWidth={1.5} className="animate-spin" />
          ) : (
            <CheckCircle size={15} strokeWidth={1.5} />
          )}
          {confirming ? 'Potvrzuji…' : 'Potvrdit jako zakázku'}
        </button>
        <p className="text-xs text-muted-foreground mt-2">
          Odešle klientovi email o zahájení zakázky a přesune ji do sekce Zakázky.
        </p>
      </div>
    </div>
  )
}
