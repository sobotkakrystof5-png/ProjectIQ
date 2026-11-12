'use client'

import { useOptimistic, useTransition } from 'react'
import { Mail, Phone, Calendar, Briefcase, MessageSquare, CheckCircle, Trash2, Loader2 } from 'lucide-react'
import { confirmWebLead, deleteWebLead } from '@/app/actions'
import { toast } from '@/components/ui/toast'
import { LEAD_ORIGINS, toLeadOrigin } from '@/lib/lead-origins'
import { ContactActions } from '@/components/admin/contact-actions'
import { formatPhone, mailtoHref, telHref } from '@/lib/contacts/href'

export interface WebLead {
  id: string
  client_name: string
  client_email: string | null
  client_phone: string | null
  service_type: string | null
  description: string | null
  created_at: string
  consultation_at: string | null
  /** Odkud poptávka přišla — po sloučení inboxů (AD02) štítek na kartě. */
  lead_origin: string | null
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

/**
 * Potvrzení a odmítnutí se ukáže hned (AD08). `useOptimistic` drží stav jen
 * po dobu akce: dojde-li potvrzení do konce, server poptávku z inboxu vyřadí
 * a karta zmizí; selže-li, stav se sám vrátí a tlačítko je zase aktivní —
 * není potřeba ho ručně přepínat zpátky.
 */
type Pending = 'idle' | 'confirming' | 'deleting'

export function LeadCard({ lead }: { lead: WebLead }) {
  const [pending, setPending] = useOptimistic<Pending, Pending>('idle', (_, next) => next)
  const [, startTransition] = useTransition()
  const confirming = pending === 'confirming'
  const deleting = pending === 'deleting'
  const cfg = LEAD_ORIGINS[toLeadOrigin(lead.lead_origin)]

  function handleConfirm() {
    if (pending !== 'idle') return
    startTransition(async () => {
      setPending('confirming')
      try {
        await confirmWebLead(lead.id)
      } catch {
        // `err.message` se tu schválně neukazuje: u síťové chyby je to
        // anglické „Failed to fetch" a u serverové ji produkční build Nextu
        // stejně zahodí (ověřeno v prohlížeči, AD08). Stav se sám vrátí
        // na výchozí, uživateli stačí česky říct, že se to nepovedlo.
        toast.error('Poptávku se nepodařilo potvrdit, zkuste to prosím znovu')
      }
    })
  }

  function handleDelete() {
    if (pending !== 'idle') return
    if (!confirm(`Opravdu smazat poptávku od ${lead.client_name}?`)) return
    startTransition(async () => {
      setPending('deleting')
      try {
        await deleteWebLead(lead.id)
      } catch {
        toast.error('Poptávku se nepodařilo smazat')
      }
    })
  }

  const iconCls = 'shrink-0 text-navy-400'
  const linkCls = 'hover:text-navy-800 transition-colors'

  return (
    <div className="bg-white border border-border rounded-xl p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-foreground text-base">{lead.client_name}</h3>
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
              {cfg.domain ?? cfg.name}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">Poptávka přijata {formatCreated(lead.created_at)}</p>
        </div>
        <button
          onClick={handleDelete}
          disabled={deleting || confirming}
          className="p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40"
          title="Smazat poptávku"
        >
          {deleting ? <Loader2 size={16} strokeWidth={1.5} className="animate-spin" /> : <Trash2 size={16} strokeWidth={1.5} />}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
        {lead.client_email && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Mail size={14} strokeWidth={1.5} className={iconCls} />
            <a href={mailtoHref(lead.client_email) ?? `mailto:${lead.client_email}`} className={`${linkCls} truncate`}>
              {lead.client_email}
            </a>
          </div>
        )}
        {lead.client_phone && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Phone size={14} strokeWidth={1.5} className={iconCls} />
            <a href={telHref(lead.client_phone) ?? `tel:${lead.client_phone}`} className={linkCls}>
              {formatPhone(lead.client_phone) ?? lead.client_phone}
            </a>
          </div>
        )}
        {lead.service_type && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Briefcase size={14} strokeWidth={1.5} className={iconCls} />
            <span>{lead.service_type}</span>
          </div>
        )}
        {lead.consultation_at && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar size={14} strokeWidth={1.5} className={iconCls} />
            <span>Konzultace: {formatDate(lead.consultation_at)}</span>
          </div>
        )}
      </div>

      {lead.description && (
        <div className="flex items-start gap-2 text-sm text-muted-foreground bg-muted/30 rounded-lg p-3">
          <MessageSquare size={14} strokeWidth={1.5} className={`mt-0.5 ${iconCls}`} />
          <p className="leading-relaxed">{lead.description}</p>
        </div>
      )}

      {/* Zavolat nebo napsat ještě před potvrzením poptávky (AD10). */}
      <ContactActions
        phone={lead.client_phone}
        email={lead.client_email}
        context={{ projectName: lead.client_name, at: lead.consultation_at }}
      />

      <div className="pt-1">
        <button
          onClick={handleConfirm}
          disabled={confirming || deleting}
          className="brand-gradient flex items-center gap-2 text-white text-sm font-medium px-4 py-2.5 rounded-lg shadow-sm hover:opacity-90 transition-opacity disabled:opacity-60"
        >
          {confirming ? (
            <Loader2 size={15} strokeWidth={1.5} className="animate-spin" />
          ) : (
            <CheckCircle size={15} strokeWidth={1.5} />
          )}
          {confirming ? 'Potvrzeno' : 'Potvrdit jako zakázku'}
        </button>
        <p className="text-xs text-muted-foreground mt-2">
          Odešle klientovi e-mail o zahájení zakázky a přesune ji do zakázek.
        </p>
      </div>
    </div>
  )
}
