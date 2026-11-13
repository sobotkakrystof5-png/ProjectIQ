'use client'

import { Fragment, useEffect, useOptimistic, useState, useTransition } from 'react'
import Link from 'next/link'
import { Plus, Trash2, Pencil, Check, X, Phone, Mail, Building2, User, ChevronDown, ChevronRight, FolderPlus, PhoneCall, Users, AtSign, MessageCircle, Video, MoreHorizontal, Clock, Undo2, Send, MessageSquareText, CheckCircle2, CalendarDays, StickyNote, ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'
import { Badge, badgeVariants } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ws/brand'
import { toast } from '@/components/ui/toast'
import { LEAD_ACTION_TONE, LEAD_STATUS_TONE, toneVariant } from '@/lib/admin-status'
import { createLead, updateLead, deleteLead, convertLeadToProject, setCallAnswered, moveLeadToWaiting, moveLeadFromWaiting, sendPortfolioEmail, addLeadNote, deleteLeadNote, getLeadNotes } from '@/app/calls-actions'
import type { LeadPayload } from '@/app/calls-actions'
import type { SortDir } from '@/lib/admin-table'
import { PortfolioEmailModal } from '@/components/PortfolioEmailModal'
import { cn, formatDate } from '@/lib/utils'
import { ContactActions } from '@/components/admin/contact-actions'
import { formatPhone, mailtoHref, telHref } from '@/lib/contacts/href'
import { pragueDateTimeToISO } from '@/lib/prague-time'
import {
  LEAD_STATUS_LABELS,
  LEAD_ACTION_TYPE_LABELS,
  type ClientLead,
  type LeadStatus,
  type LeadActionType,
  type LeadNote,
} from '@/lib/types'

/**
 * Pole v řádku tabulky (AD17). Dílky mají pro pole rádius 12 px a navy okraj
 * při zaostření (DESIGN.md → Inputs); v hustém řádku je jen nižší než jinde.
 */
const cellInput =
  'w-full rounded-chip border border-input bg-surface px-2.5 py-1.5 text-sm text-ink transition-colors placeholder:text-quiet focus-visible:border-navy-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30'

/** Ikonová akce v řádku: plocha 44 px (B9), ikona uvnitř zůstává drobná. */
const iconAction =
  'inline-flex h-11 w-11 items-center justify-center rounded-chip text-quiet transition-colors hover:bg-navy-50 hover:text-navy-700 disabled:opacity-40 disabled:cursor-not-allowed'
const iconActionDanger =
  'inline-flex h-11 w-11 items-center justify-center rounded-chip text-quiet transition-colors hover:bg-danger/5 hover:text-danger disabled:opacity-40'
const iconActionPrimary =
  'inline-flex h-11 w-11 items-center justify-center rounded-chip bg-navy-700 text-white transition-colors hover:bg-navy-800 disabled:opacity-40 disabled:cursor-not-allowed'

const LEAD_STATUSES: LeadStatus[] = ['cold', 'warm', 'hot', 'converted', 'lost']
const LEAD_ACTION_TYPES: LeadActionType[] = ['call', 'meeting', 'email', 'whatsapp', 'online', 'other']

const ACTION_TYPE_ICONS: Record<LeadActionType, React.ReactNode> = {
  call:    <PhoneCall size={11} strokeWidth={1.5} />,
  meeting: <Users size={11} strokeWidth={1.5} />,
  email:   <AtSign size={11} strokeWidth={1.5} />,
  whatsapp:<MessageCircle size={11} strokeWidth={1.5} />,
  online:  <Video size={11} strokeWidth={1.5} />,
  other:   <MoreHorizontal size={11} strokeWidth={1.5} />,
}

const EMPTY_FORM: LeadPayload = {
  company_name: '',
  contact_name: null,
  phone: null,
  email: null,
  lead_status: 'cold',
  next_action: null,
  next_action_date: null,
  next_action_time: null,
  next_action_type: null,
  notes: null,
  estimated_value: null,
  call_answered: null,
}

function StatusBadge({ status }: { status: LeadStatus }) {
  return (
    <Badge variant={toneVariant(LEAD_STATUS_TONE[status])}>
      {LEAD_STATUS_LABELS[status]}
    </Badge>
  )
}

function ActionTypeBadge({ type }: { type: LeadActionType }) {
  return (
    <Badge variant={toneVariant(LEAD_ACTION_TONE[type])}>
      {ACTION_TYPE_ICONS[type]}
      {LEAD_ACTION_TYPE_LABELS[type]}
    </Badge>
  )
}

function CallAnsweredToggle({
  answered,
  onClick,
  isPending,
}: {
  answered: boolean | null
  onClick: (next: boolean | null) => void
  isPending: boolean
}) {
  const next = answered === null ? true : answered === true ? false : null

  if (answered === true) {
    return (
      <button
        onClick={() => onClick(next)}
        disabled={isPending}
        title="Zvedl — klikni pro změnu"
        className={cn(badgeVariants({ variant: toneVariant('success') }), 'min-h-11 px-3 transition-colors hover:bg-navy-800 disabled:opacity-40')}
      >
        <Check size={11} strokeWidth={1.5} />
        Zvedl
      </button>
    )
  }

  if (answered === false) {
    return (
      <button
        onClick={() => onClick(next)}
        disabled={isPending}
        title="Nezvedl — klikni pro změnu"
        className={cn(badgeVariants({ variant: toneVariant('danger') }), 'min-h-11 px-3 transition-colors hover:bg-danger/20 disabled:opacity-40')}
      >
        <X size={11} strokeWidth={1.5} />
        Nezvedl
      </button>
    )
  }

  return (
    <button
      onClick={() => onClick(next)}
      disabled={isPending}
      title="Zaznamenat výsledek hovoru"
      className={cn(badgeVariants({ variant: toneVariant('neutral') }), 'min-h-11 px-3 transition-colors hover:bg-navy-100 disabled:opacity-40')}
    >
      <Phone size={11} strokeWidth={1.5} />
      —
    </button>
  )
}

function LeadForm({
  initial,
  onSave,
  onCancel,
  isPending,
}: {
  initial: LeadPayload
  onSave: (data: LeadPayload) => void
  onCancel: () => void
  isPending: boolean
}) {
  const [form, setForm] = useState<LeadPayload>(initial)

  const set = (field: keyof LeadPayload, value: string | number | null) => {
    setForm(prev => ({ ...prev, [field]: value === '' ? null : value }))
  }

  return (
    <tr className="bg-navy-50/40">
      <td className="px-3 py-2">
        <input
          autoFocus
          className={cn(cellInput)}
          placeholder="Název firmy *"
          value={form.company_name}
          onChange={e => setForm(prev => ({ ...prev, company_name: e.target.value }))}
        />
      </td>
      <td className="px-3 py-2">
        <input
          className={cn(cellInput)}
          placeholder="Jméno"
          value={form.contact_name ?? ''}
          onChange={e => set('contact_name', e.target.value)}
        />
      </td>
      <td className="px-3 py-2">
        <input
          className={cn(cellInput)}
          placeholder="+420…"
          value={form.phone ?? ''}
          onChange={e => set('phone', e.target.value)}
        />
      </td>
      {/* Zvedl? — v editaci prázdný (toggle se ovládá přímo v řádku) */}
      <td className="px-3 py-2" />
      <td className="px-3 py-2">
        <input
          type="email"
          className={cn(cellInput)}
          placeholder="email@firma.cz"
          value={form.email ?? ''}
          onChange={e => set('email', e.target.value)}
        />
      </td>
      <td className="px-3 py-2">
        <div className="relative">
          <select
            className={cn(cellInput, 'appearance-none pr-7')}
            value={form.lead_status}
            onChange={e => setForm(prev => ({ ...prev, lead_status: e.target.value as LeadStatus }))}
          >
            {LEAD_STATUSES.map(s => (
              <option key={s} value={s}>{LEAD_STATUS_LABELS[s]}</option>
            ))}
          </select>
          <ChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-quiet" />
        </div>
      </td>
      <td className="px-3 py-2">
        <div className="relative">
          <select
            className={cn(cellInput, 'appearance-none pr-7')}
            value={form.next_action_type ?? ''}
            onChange={e => set('next_action_type', e.target.value || null)}
          >
            <option value="">— typ —</option>
            {LEAD_ACTION_TYPES.map(t => (
              <option key={t} value={t}>{LEAD_ACTION_TYPE_LABELS[t]}</option>
            ))}
          </select>
          <ChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-quiet" />
        </div>
      </td>
      <td className="px-3 py-2">
        <input
          className={cn(cellInput)}
          placeholder="Zavolat zítra, poslat email…"
          value={form.next_action ?? ''}
          onChange={e => set('next_action', e.target.value)}
        />
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-col gap-1">
          <input
            type="date"
            className={cn(cellInput)}
            value={form.next_action_date ?? ''}
            onChange={e => set('next_action_date', e.target.value)}
          />
          <input
            type="time"
            className={cn(cellInput)}
            value={form.next_action_time ?? ''}
            onChange={e => set('next_action_time', e.target.value)}
          />
        </div>
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-col gap-1">
          <input
            type="number"
            className={cn(cellInput)}
            placeholder="Kč"
            value={form.estimated_value ?? ''}
            onChange={e => set('estimated_value', e.target.value ? Number(e.target.value) : null)}
          />
          <textarea
            className={cn(cellInput, 'resize-none')}
            placeholder="Shrnutí (kontext leadu)…"
            value={form.notes ?? ''}
            rows={2}
            onChange={e => set('notes', e.target.value)}
          />
        </div>
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-1">
          <button
            disabled={!form.company_name.trim() || isPending}
            onClick={() => form.company_name.trim() && onSave(form)}
            className={iconActionPrimary}
          >
            <Check size={14} />
          </button>
          <button
            onClick={onCancel}
            className={iconAction}
          >
            <X size={14} />
          </button>
        </div>
      </td>
    </tr>
  )
}

function CompanyCell({
  lead,
  expanded,
  onToggleExpand,
  notes,
}: {
  lead: ClientLead
  expanded?: boolean
  onToggleExpand?: () => void
  notes?: LeadNote[]
}) {
  const noteCount = notes?.length ?? 0
  const lastNote = notes?.[0]

  return (
    <td className="px-3 py-2.5">
      <div className="flex items-center gap-2">
        {onToggleExpand ? (
          <button
            onClick={onToggleExpand}
            title={expanded ? 'Sbalit detail' : 'Rozbalit detail'}
            aria-expanded={expanded}
            aria-label={expanded ? 'Sbalit detail kontaktu' : 'Rozbalit detail kontaktu'}
            className="-ml-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-chip text-quiet transition-colors hover:bg-navy-50 hover:text-navy-700"
          >
            {expanded
              ? <ChevronDown size={13} strokeWidth={1.5} />
              : <ChevronRight size={13} strokeWidth={1.5} />
            }
          </button>
        ) : (
          <Building2 size={13} className="shrink-0 text-quiet" strokeWidth={1.5} />
        )}
        <span className="text-sm font-medium text-foreground">{lead.company_name}</span>
        {lead.calendar_event_id && (
          <span title="Založeno z kalendáře" className="shrink-0 text-navy-500">
            <CalendarDays size={12} strokeWidth={1.5} />
          </span>
        )}
        {noteCount > 0 && (
          <span
            title={lastNote ? `${noteCount}× poznámka — naposledy: ${lastNote.content}` : `${noteCount}× poznámka`}
            className="flex shrink-0 items-center gap-0.5 text-quiet/70"
          >
            <StickyNote size={11} strokeWidth={1.5} />
            <span className="text-[11px]">{noteCount}</span>
          </span>
        )}
      </div>
    </td>
  )
}

function ContactCell({ lead }: { lead: ClientLead }) {
  return (
    <td className="px-3 py-2.5">
      {lead.contact_name && (
        <div className="flex items-center gap-1.5">
          <User size={12} className="shrink-0 text-quiet" strokeWidth={1.5} />
          <span className="text-sm text-foreground">{lead.contact_name}</span>
        </div>
      )}
    </td>
  )
}

function PhoneCell({ lead }: { lead: ClientLead }) {
  return (
    <td className="px-3 py-2.5">
      {lead.phone && (
        <a
          href={telHref(lead.phone) ?? `tel:${lead.phone}`}
          className="inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap text-sm text-navy-700 hover:underline"
        >
          <Phone size={13} strokeWidth={1.5} aria-hidden="true" />
          <span className="font-num">{formatPhone(lead.phone) ?? lead.phone}</span>
        </a>
      )}
    </td>
  )
}

function EmailCell({ lead }: { lead: ClientLead }) {
  return (
    <td className="px-3 py-2.5">
      {lead.email && (
        <div className="flex flex-col gap-0.5">
          <a
            href={mailtoHref(lead.email) ?? `mailto:${lead.email}`}
            className="inline-flex min-h-11 max-w-[180px] items-center gap-1.5 text-sm text-navy-700 hover:underline"
          >
            <Mail size={13} strokeWidth={1.5} aria-hidden="true" />
            <span className="truncate">{lead.email}</span>
          </a>
          {lead.portfolio_sent_at && (
            <span className="flex items-center gap-1 text-[11px] text-navy-700" title="Portfolio bylo odesláno">
              <CheckCircle2 size={11} strokeWidth={1.5} />
              Odesláno {new Date(lead.portfolio_sent_at).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' })}
            </span>
          )}
        </div>
      )}
    </td>
  )
}

function ValueCell({ lead }: { lead: ClientLead }) {
  return (
    <td className="px-3 py-2.5">
      {lead.estimated_value != null ? (
        <span className="whitespace-nowrap font-num text-sm font-medium text-ink">
          {Number(lead.estimated_value).toLocaleString('cs-CZ')} Kč
        </span>
      ) : (
        <span className="text-quiet/60">—</span>
      )}
    </td>
  )
}

function LeadRow({
  lead,
  notes,
  onEdit,
  onDelete,
  onConvert,
  onMoveToWaiting,
  onToggleAnswered,
  onSendPortfolio,
  onOpenCustomMessage,
  onAddNote,
  onDeleteNote,
  isPending,
  expanded,
  onToggleExpand,
  highlighted,
}: {
  lead: ClientLead
  notes: LeadNote[]
  onEdit: () => void
  onDelete: () => void
  onConvert: () => void
  onMoveToWaiting: () => void
  onToggleAnswered: (val: boolean | null) => void
  onSendPortfolio: () => void
  onOpenCustomMessage: () => void
  onAddNote: (content: string) => void
  onDeleteNote: (id: string) => void
  isPending: boolean
  expanded: boolean
  onToggleExpand: () => void
  highlighted: boolean
}) {
  const isOverdue = lead.next_action_date
    ? new Date(lead.next_action_date) < new Date(new Date().toDateString())
    : false

  const formattedDateTime = (() => {
    if (!lead.next_action_date) return null
    const date = new Date(lead.next_action_date).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short', year: 'numeric' })
    if (!lead.next_action_time) return date
    const time = lead.next_action_time.slice(0, 5)
    return `${date} ${time}`
  })()

  return (
    <Fragment>
    <tr
      id={`lead-${lead.id}`}
      className={`group border-t border-navy-100 transition-colors ${
        highlighted ? 'bg-navy-50 ring-2 ring-inset ring-navy-300' : 'hover:bg-navy-50/50'
      }`}
    >
      <CompanyCell lead={lead} expanded={expanded} onToggleExpand={onToggleExpand} notes={notes} />
      <ContactCell lead={lead} />
      <PhoneCell lead={lead} />
      <td className="px-3 py-2.5">
        <CallAnsweredToggle
          answered={lead.call_answered}
          onClick={onToggleAnswered}
          isPending={isPending}
        />
      </td>
      <EmailCell lead={lead} />
      <td className="px-3 py-2.5">
        <StatusBadge status={lead.lead_status} />
      </td>
      <td className="px-3 py-2.5">
        {lead.next_action_type
          ? <ActionTypeBadge type={lead.next_action_type} />
          : <span className="text-quiet/60">—</span>
        }
      </td>
      <td className="px-3 py-2.5">
        <span className="text-sm text-ink">{lead.next_action ?? <span className="text-quiet/60">—</span>}</span>
      </td>
      <td className="px-3 py-2.5">
        {formattedDateTime ? (
          <div className="flex flex-col gap-0.5">
            <span className={cn('font-num text-sm font-medium', isOverdue ? 'text-danger' : 'text-ink')}>
              {formattedDateTime}
              {isOverdue && ' ⚠'}
            </span>
          </div>
        ) : (
          <span className="text-quiet/60">—</span>
        )}
      </td>
      <ValueCell lead={lead} />
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1">
          {lead.email && lead.next_action_date && (
            <button
              onClick={onSendPortfolio}
              disabled={isPending}
              title="Poslat portfolio (odešle ihned)"
              className={iconActionPrimary}
            >
              <Send size={13} strokeWidth={1.5} />
            </button>
          )}
          {lead.email && (
            <button
              onClick={onOpenCustomMessage}
              disabled={isPending}
              title="Napsat jinou zprávu"
              className={iconAction}
            >
              <MessageSquareText size={13} strokeWidth={1.5} />
            </button>
          )}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={onConvert}
              disabled={isPending || lead.lead_status === 'converted'}
              title="Převést na zakázku"
              className={iconAction}
            >
              <FolderPlus size={13} strokeWidth={1.5} />
            </button>
            <button
              onClick={onMoveToWaiting}
              disabled={isPending}
              title="Přesunout do Čekání"
              className={iconAction}
            >
              <Clock size={13} strokeWidth={1.5} />
            </button>
            <button
              onClick={onEdit}
              title="Upravit kontakt"
              aria-label="Upravit kontakt"
              className={iconAction}
            >
              <Pencil size={15} strokeWidth={1.5} aria-hidden="true" />
            </button>
            <button
              onClick={onDelete}
              disabled={isPending}
              title="Smazat kontakt"
              aria-label="Smazat kontakt"
              className={iconActionDanger}
            >
              <Trash2 size={15} strokeWidth={1.5} aria-hidden="true" />
            </button>
          </div>
        </div>
      </td>
    </tr>
    {expanded && (
      <LeadDetailRow lead={lead} notes={notes} onAddNote={onAddNote} onDeleteNote={onDeleteNote} isPending={isPending} />
    )}
    </Fragment>
  )
}

// Poznámky a kontaktní akce se do tabulky nevejdou — žijí v rozbaleném řádku.
function LeadDetailRow({
  lead,
  notes,
  onAddNote,
  onDeleteNote,
  isPending,
}: {
  lead: ClientLead
  notes: LeadNote[]
  onAddNote: (content: string) => void
  onDeleteNote: (id: string) => void
  isPending: boolean
}) {
  const [draft, setDraft] = useState('')

  const submit = () => {
    const content = draft.trim()
    if (!content) return
    onAddNote(content)
    setDraft('')
  }

  return (
    <tr className="border-t border-navy-100 bg-navy-50/60">
      <td colSpan={11} className="px-6 py-4">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
          <div className="space-y-3 min-w-0">
            <p className="flex items-center gap-1.5 font-num text-xs font-medium uppercase tracking-[0.12em] text-quiet">
              <StickyNote size={12} strokeWidth={1.5} />
              Poznámky
            </p>

            <div className="flex flex-col gap-1.5">
              <textarea
                className={cn(cellInput, 'resize-none')}
                placeholder="Nový zápisek z hovoru…"
                rows={2}
                value={draft}
                onChange={e => setDraft(e.target.value)}
              />
              <button
                onClick={submit}
                disabled={!draft.trim() || isPending}
                className="inline-flex min-h-11 items-center gap-1.5 self-start rounded-full bg-navy-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-navy-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Plus size={12} strokeWidth={1.5} />
                Přidat poznámku
              </button>
            </div>

            {notes.length > 0 ? (
              <ul className="space-y-2.5 pt-1">
                {notes.map((note, i) => (
                  <li key={note.id} className="relative flex gap-2.5 group/note">
                    <div className="flex flex-col items-center">
                      <div className="w-1.5 h-1.5 rounded-full bg-navy-600 mt-1.5 shrink-0" />
                      {i < notes.length - 1 && <div className="w-px flex-1 bg-navy-100 mt-1" />}
                    </div>
                    <div className="pb-2.5 flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-num text-xs text-quiet">{formatDate(note.created_at)}</span>
                        <button
                          onClick={() => onDeleteNote(note.id)}
                          disabled={isPending}
                          className="text-quiet opacity-0 transition-opacity hover:text-danger group-hover/note:opacity-100 disabled:opacity-40"
                          title="Smazat poznámku"
                        >
                          <Trash2 size={11} strokeWidth={1.5} />
                        </button>
                      </div>
                      <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{note.content}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-quiet">Žádné poznámky.</p>
            )}

            <p className="pt-1 text-xs text-quiet">
              Kontakt přidán {new Date(lead.created_at).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' })}
              {lead.calendar_event_id && ' · založeno z kalendáře'}
            </p>
          </div>

          {/* Volat, SMS, e-mail, WhatsApp i šablony z jednoho místa (AD10). */}
          <ContactActions
            className="md:justify-end"
            phone={lead.phone}
            email={lead.email}
            context={{ at: pragueDateTimeToISO(lead.next_action_date, lead.next_action_time) }}
            emptyHint="Kontakt nemá telefon ani e-mail. Doplňte je úpravou kontaktu a zavoláte jedním klikem."
          />
        </div>
      </td>
    </tr>
  )
}

function WaitingLeadForm({
  initial,
  onSave,
  onCancel,
  isPending,
}: {
  initial: LeadPayload
  onSave: (data: LeadPayload) => void
  onCancel: () => void
  isPending: boolean
}) {
  const [form, setForm] = useState<LeadPayload>(initial)
  const set = (field: keyof LeadPayload, value: string | number | null) => {
    setForm(prev => ({ ...prev, [field]: value === '' ? null : value }))
  }

  return (
    <tr className="bg-navy-50/40">
      <td className="px-3 py-2">
        <input
          autoFocus
          className={cn(cellInput)}
          placeholder="Název firmy *"
          value={form.company_name}
          onChange={e => setForm(prev => ({ ...prev, company_name: e.target.value }))}
        />
      </td>
      <td className="px-3 py-2">
        <input
          className={cn(cellInput)}
          placeholder="Jméno"
          value={form.contact_name ?? ''}
          onChange={e => set('contact_name', e.target.value)}
        />
      </td>
      <td className="px-3 py-2">
        <input
          className={cn(cellInput)}
          placeholder="+420…"
          value={form.phone ?? ''}
          onChange={e => set('phone', e.target.value)}
        />
      </td>
      <td className="px-3 py-2">
        <input
          type="email"
          className={cn(cellInput)}
          placeholder="email@firma.cz"
          value={form.email ?? ''}
          onChange={e => set('email', e.target.value)}
        />
      </td>
      <td className="px-3 py-2">
        <textarea
          className={cn(cellInput, 'resize-none')}
          placeholder="Shrnutí (kontext leadu)…"
          value={form.notes ?? ''}
          rows={2}
          onChange={e => set('notes', e.target.value)}
        />
      </td>
      <td className="px-3 py-2">
        <input
          type="number"
          className={cn(cellInput)}
          placeholder="Kč"
          value={form.estimated_value ?? ''}
          onChange={e => set('estimated_value', e.target.value ? Number(e.target.value) : null)}
        />
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-1">
          <button
            disabled={!form.company_name.trim() || isPending}
            onClick={() => form.company_name.trim() && onSave(form)}
            className={iconActionPrimary}
          >
            <Check size={14} />
          </button>
          <button
            onClick={onCancel}
            className={iconAction}
          >
            <X size={14} />
          </button>
        </div>
      </td>
    </tr>
  )
}

function WaitingRow({
  lead,
  notes,
  onEdit,
  onConvert,
  onMoveBack,
  onDelete,
  isPending,
  highlighted,
}: {
  lead: ClientLead
  notes: LeadNote[]
  onEdit: () => void
  onConvert: () => void
  onMoveBack: () => void
  onDelete: () => void
  isPending: boolean
  highlighted: boolean
}) {
  const lastNote = notes[0]

  return (
    <tr
      id={`lead-${lead.id}`}
      className={`group border-t border-navy-100 transition-colors ${
        highlighted ? 'bg-navy-50 ring-2 ring-inset ring-navy-300' : 'hover:bg-navy-50/50'
      }`}
    >
      <CompanyCell lead={lead} notes={notes} />
      <ContactCell lead={lead} />
      <PhoneCell lead={lead} />
      <EmailCell lead={lead} />
      <td className="px-3 py-2.5">
        {lastNote ? (
          <span className="block max-w-[200px] truncate text-sm text-quiet">{lastNote.content}</span>
        ) : (
          <span className="text-quiet/60">—</span>
        )}
      </td>
      <ValueCell lead={lead} />
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={onConvert}
            disabled={isPending}
            title="Převést na zakázku"
            className={iconAction}
          >
            <FolderPlus size={13} strokeWidth={1.5} />
          </button>
          <button
            onClick={onMoveBack}
            disabled={isPending}
            title="Vrátit zpět do Hovorů"
            className={iconAction}
          >
            <Undo2 size={13} strokeWidth={1.5} />
          </button>
          <button
            onClick={onEdit}
            title="Upravit"
            className={iconAction}
          >
            <Pencil size={13} strokeWidth={1.5} />
          </button>
          <button
            onClick={onDelete}
            disabled={isPending}
            className={iconActionDanger}
          >
            <Trash2 size={13} strokeWidth={1.5} />
          </button>
        </div>
      </td>
    </tr>
  )
}

/**
 * Kontakt ve výpisu: k leadu patří náhled posledních poznámek a jejich počet
 * (`LEFT JOIN LATERAL`, AD07). Celé poznámky se dotáhnou po rozbalení řádku.
 */
export type LeadWithNotes = ClientLead & { note_preview: LeadNote[]; notes_count: number }

/** Hlavička, která se dá seřadit. Je to odkaz — stav řazení je v adrese. */
function SortHeader({
  label,
  columnKey,
  sortKey,
  dir,
  sortLinks,
  className,
}: {
  label: string
  columnKey: string
  sortKey: string
  dir: SortDir
  /** Hotové odkazy ze serveru — funkce se do klientské komponenty poslat nedá. */
  sortLinks: Record<string, string>
  className?: string
}) {
  const active = sortKey === columnKey
  const href = sortLinks[columnKey]
  if (!href) return <PlainHeader label={label} className={className} />
  return (
    <th
      className={`px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-quiet ${className ?? ''}`}
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <Link
        href={href}
        scroll={false}
        className={`group -mx-2 inline-flex min-h-11 items-center gap-1.5 rounded-chip px-2 uppercase transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? 'text-ink' : ''}`}
      >
        {label}
        {active ? (
          dir === 'asc' ? <ArrowUp size={13} strokeWidth={1.5} /> : <ArrowDown size={13} strokeWidth={1.5} />
        ) : (
          <ChevronsUpDown size={13} strokeWidth={1.5} className="opacity-0 transition-opacity group-hover:opacity-60" />
        )}
      </Link>
    </th>
  )
}

const PlainHeader = ({ label, className }: { label: string; className?: string }) => (
  <th className={`px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-quiet ${className ?? ''}`}>{label}</th>
)

/**
 * Hovory a Čekání na odpověď (AD07).
 *
 * Řádky chodí ze serveru po stránkách a seřazené; komponenta si je drží
 * jen kvůli okamžité odezvě po úpravě. Poznámky má každý řádek v náhledu
 * a celé se načtou, až se kontakt rozbalí.
 */
/** Jediná změna, kterou kliknutí slibuje, než server odpoví. */
export type OptimisticChange =
  | { type: 'answered'; id: string; value: boolean | null }
  | { type: 'remove'; id: string }

export function optimisticReducer(current: LeadWithNotes[], change: OptimisticChange): LeadWithNotes[] {
  if (change.type === 'remove') return current.filter((l) => l.id !== change.id)
  return current.map((l) => (l.id === change.id ? { ...l, call_answered: change.value } : l))
}

export default function LeadsTable({
  initialLeads,
  waiting,
  sortKey,
  dir,
  sortLinks,
  focusLeadId,
}: {
  initialLeads: LeadWithNotes[]
  /** `true` = pohled „Čekání na odpověď". */
  waiting: boolean
  sortKey: string
  dir: SortDir
  /** Odkaz na řazení pro každý sloupec, spočítaný na serveru. */
  sortLinks: Record<string, string>
  focusLeadId?: string
}) {
  /**
   * Řádky se vykreslují **z propů** (AD17). Dřív si je komponenta kopírovala
   * do `useState` a po každé akci kopii ručně dorovnávala — kopie se přitom
   * mohla se serverem rozejít (jiná záložka, cizí změna) a stránka se po
   * každé akci vykreslovala na serveru nadarmo. Každá akce v
   * `app/calls-actions.ts` volá `revalidatePath('/dashboard/calls')`, takže
   * nové řádky přijdou shora.
   *
   * Akce na jedno kliknutí se ukážou hned (AD08): `useOptimistic` drží změnu
   * jen po dobu transakce, pak ji přebijí skutečné propy — nebo se při chybě
   * sama vrátí.
   */
  const [optimisticLeads, applyOptimistic] = useOptimistic(initialLeads, optimisticReducer)
  /** Celé poznámky rozbaleného kontaktu; nenačtené padají zpátky na náhled z propů. */
  const [loadedNotes, setLoadedNotes] = useState<Record<string, LeadNote[]>>({})
  const [addingNew, setAddingNew] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingWaitingId, setEditingWaitingId] = useState<string | null>(null)
  const [portfolioModalLead, setPortfolioModalLead] = useState<ClientLead | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [highlightedId, setHighlightedId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const notesOf = (lead: LeadWithNotes) => loadedNotes[lead.id] ?? lead.note_preview ?? []

  // Příchod z kalendáře (`?lead=ID`): kontakt rozbalit, odscrollovat na něj
  // a na chvíli zvýraznit, ať je v široké tabulce vidět, o který řádek jde.
  useEffect(() => {
    if (!focusLeadId) return
    if (!initialLeads.some((l) => l.id === focusLeadId)) return

    setExpandedId(focusLeadId)
    setHighlightedId(focusLeadId)

    const scroll = requestAnimationFrame(() => {
      document.getElementById(`lead-${focusLeadId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
    const fade = setTimeout(() => setHighlightedId(null), 4000)

    return () => {
      cancelAnimationFrame(scroll)
      clearTimeout(fade)
    }
  }, [focusLeadId, initialLeads])

  /** Rozbalení kontaktu dotáhne celé poznámky; náhled zůstane, než dojdou. */
  const toggleExpand = (leadId: string) => {
    setExpandedId((prev) => (prev === leadId ? null : leadId))
    if (loadedNotes[leadId]) return
    startTransition(async () => {
      const full = await getLeadNotes(leadId)
      setLoadedNotes((prev) => ({ ...prev, [leadId]: full }))
    })
  }

  const handleCreate = (data: LeadPayload) => {
    startTransition(async () => {
      await createLead(data)
      setAddingNew(false)
    })
  }

  const handleUpdate = (id: string, data: LeadPayload) => {
    startTransition(async () => {
      await updateLead(id, data)
      setEditingId(null)
      setEditingWaitingId(null)
    })
  }

  const handleDelete = (id: string) => {
    if (!confirm('Opravdu smazat tento kontakt?')) return
    optimisticky({ type: 'remove', id }, () => deleteLead(id))
  }

  const handleConvert = (id: string) => {
    if (!confirm('Převést kontakt na novou zakázku? Lead bude označen jako Převeden.')) return
    startTransition(async () => {
      await convertLeadToProject(id)
    })
  }

  // Přesun mezi pohledy řádek z téhle stránky odebere — je teď v tom druhém.
  /**
   * Výpadek sítě vyhodí z volání akce a odmítnutá promise uvnitř transition
   * shodí obrazovku do chybové hranice — ověřeno v prohlížeči přerušeným
   * požadavkem (AD08). Optimistický stav se vrátí sám, uživateli stačí říct,
   * že se to neuložilo.
   */
  const optimisticky = (zmena: OptimisticChange, akce: () => Promise<void>) => {
    startTransition(async () => {
      applyOptimistic(zmena)
      try {
        await akce()
      } catch {
        toast.error('Nepodařilo se uložit, zkuste to prosím znovu')
      }
    })
  }

  const handleMoveToWaiting = (id: string) => optimisticky({ type: 'remove', id }, () => moveLeadToWaiting(id))

  const handleMoveFromWaiting = (id: string) => optimisticky({ type: 'remove', id }, () => moveLeadFromWaiting(id))

  const handleToggleAnswered = (id: string, val: boolean | null) =>
    optimisticky({ type: 'answered', id, value: val }, () => setCallAnswered(id, val))

  const handleSendPortfolio = (id: string) => {
    startTransition(async () => {
      const result = await sendPortfolioEmail(id)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success('Portfolio odesláno')
    })
  }

  const handleAddNote = (leadId: string, content: string) => {
    startTransition(async () => {
      const created = await addLeadNote(leadId, content)
      const newNote: LeadNote = { id: created.id, lead_id: leadId, content, created_at: created.created_at }
      // Jen u rozbaleného kontaktu, kde jsou načtené celé poznámky; ostatním
      // přijde nový náhled s příštím vykreslením ze serveru.
      setLoadedNotes((prev) => (prev[leadId] ? { ...prev, [leadId]: [newNote, ...prev[leadId]] } : prev))
    })
  }

  const handleDeleteNote = (id: string) => {
    startTransition(async () => {
      await deleteLeadNote(id)
      setLoadedNotes((prev) => {
        const next: Record<string, LeadNote[]> = {}
        for (const [leadId, list] of Object.entries(prev)) next[leadId] = list.filter((n) => n.id !== id)
        return next
      })
    })
  }

  const formOf = (lead: ClientLead): LeadPayload => ({
    company_name: lead.company_name,
    contact_name: lead.contact_name,
    phone: lead.phone,
    email: lead.email,
    lead_status: lead.lead_status,
    next_action: lead.next_action,
    next_action_date: lead.next_action_date,
    next_action_time: lead.next_action_time,
    next_action_type: lead.next_action_type,
    notes: lead.notes,
    estimated_value: lead.estimated_value,
    call_answered: lead.call_answered,
  })

  const sortProps = { sortKey, dir, sortLinks }

  if (waiting) {
    return (
      <div>
        <p className="mb-4 text-sm text-quiet">Podniky, kde čekáte, jestli se ozvou.</p>

        <div className="overflow-hidden rounded-box border border-navy-100 bg-surface">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left">
              <thead>
                <tr className="border-b border-navy-100 bg-navy-50">
                  <SortHeader label="Firma" columnKey="firma" {...sortProps} />
                  <SortHeader label="Kontakt" columnKey="kontakt" {...sortProps} />
                  <PlainHeader label="Telefon" />
                  <PlainHeader label="E-mail" />
                  <PlainHeader label="Poznámka" />
                  <SortHeader label="Odhad hodnoty" columnKey="hodnota" {...sortProps} />
                  <th className="w-24 px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {optimisticLeads.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-4">
                      <EmptyState
                        size="compact"
                        title="Nikdo nečeká na odpověď"
                        description="Kontakt sem přesunete z Hovorů ikonkou hodin."
                      />
                    </td>
                  </tr>
                )}
                {optimisticLeads.map((lead) =>
                  editingWaitingId === lead.id ? (
                    <WaitingLeadForm
                      key={lead.id}
                      initial={formOf(lead)}
                      onSave={(data) => handleUpdate(lead.id, data)}
                      onCancel={() => setEditingWaitingId(null)}
                      isPending={isPending}
                    />
                  ) : (
                    <WaitingRow
                      key={lead.id}
                      lead={lead}
                      notes={notesOf(lead)}
                      onEdit={() => setEditingWaitingId(lead.id)}
                      onConvert={() => handleConvert(lead.id)}
                      onMoveBack={() => handleMoveFromWaiting(lead.id)}
                      onDelete={() => handleDelete(lead.id)}
                      isPending={isPending}
                      highlighted={highlightedId === lead.id}
                    />
                  ),
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-end">
        <Button
          onClick={() => {
            setAddingNew(true)
            setEditingId(null)
          }}
          disabled={addingNew}
        >
          <Plus size={16} strokeWidth={1.5} aria-hidden="true" />
          Přidat kontakt
        </Button>
      </div>

      <div className="overflow-hidden rounded-box border border-navy-100 bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left">
            <thead>
              <tr className="border-b border-navy-100 bg-navy-50">
                <SortHeader label="Firma" columnKey="firma" {...sortProps} />
                <SortHeader label="Kontakt" columnKey="kontakt" {...sortProps} />
                <PlainHeader label="Telefon" />
                <PlainHeader label="Zvedl?" />
                <PlainHeader label="E-mail" />
                <SortHeader label="Zájem" columnKey="zajem" {...sortProps} />
                <PlainHeader label="Typ akce" />
                <PlainHeader label="Příští akce" />
                <SortHeader label="Datum a čas" columnKey="akce" {...sortProps} />
                <SortHeader label="Odhad hodnoty" columnKey="hodnota" {...sortProps} />
                <th className="w-24 px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {addingNew && (
                <LeadForm
                  initial={EMPTY_FORM}
                  onSave={handleCreate}
                  onCancel={() => setAddingNew(false)}
                  isPending={isPending}
                />
              )}
              {optimisticLeads.length === 0 && !addingNew && (
                <tr>
                  <td colSpan={11} className="p-4">
                    <EmptyState
                      size="compact"
                      title="Zatím žádné kontakty"
                      description="Poznamenejte si, s kým jste mluvili a co dál. Z kontaktu pak uděláte zakázku jedním klikem."
                      action={
                        <Button
                          onClick={() => {
                            setAddingNew(true)
                            setEditingId(null)
                          }}
                        >
                          <Plus size={16} strokeWidth={1.5} aria-hidden="true" />
                          Přidat kontakt
                        </Button>
                      }
                    />
                  </td>
                </tr>
              )}
              {optimisticLeads.map((lead) =>
                editingId === lead.id ? (
                  <LeadForm
                    key={lead.id}
                    initial={formOf(lead)}
                    onSave={(data) => handleUpdate(lead.id, data)}
                    onCancel={() => setEditingId(null)}
                    isPending={isPending}
                  />
                ) : (
                  <LeadRow
                    key={lead.id}
                    lead={lead}
                    notes={notesOf(lead)}
                    onEdit={() => {
                      setEditingId(lead.id)
                      setAddingNew(false)
                    }}
                    onDelete={() => handleDelete(lead.id)}
                    onConvert={() => handleConvert(lead.id)}
                    onMoveToWaiting={() => handleMoveToWaiting(lead.id)}
                    onToggleAnswered={(val) => handleToggleAnswered(lead.id, val)}
                    onSendPortfolio={() => handleSendPortfolio(lead.id)}
                    onOpenCustomMessage={() => setPortfolioModalLead(lead)}
                    onAddNote={(content) => handleAddNote(lead.id, content)}
                    onDeleteNote={handleDeleteNote}
                    isPending={isPending}
                    expanded={expandedId === lead.id}
                    onToggleExpand={() => toggleExpand(lead.id)}
                    highlighted={highlightedId === lead.id}
                  />
                ),
              )}
            </tbody>
          </table>
        </div>
      </div>

      <PortfolioEmailModal
        isOpen={!!portfolioModalLead}
        lead={portfolioModalLead}
        onClose={() => setPortfolioModalLead(null)}
        // Odeslání zapisuje `portfolio_sent_at` a revaliduje, nový řádek přijde ze serveru.
        onSent={() => {}}
      />
    </div>
  )
}
