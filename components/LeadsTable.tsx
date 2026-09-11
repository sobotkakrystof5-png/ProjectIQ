'use client'

import { Fragment, useEffect, useMemo, useState, useTransition } from 'react'
import { Plus, Trash2, Pencil, Check, X, Phone, Mail, Building2, User, ChevronDown, ChevronRight, FolderPlus, PhoneCall, Users, AtSign, MessageCircle, Video, MoreHorizontal, Clock, Undo2, Send, MessageSquareText, CheckCircle2, CalendarDays, StickyNote } from 'lucide-react'
import { toast } from 'sonner'
import { createLead, updateLead, deleteLead, convertLeadToProject, setCallAnswered, moveLeadToWaiting, moveLeadFromWaiting, sendPortfolioEmail, addLeadNote, deleteLeadNote } from '@/app/calls-actions'
import type { LeadPayload } from '@/app/calls-actions'
import { PortfolioEmailModal } from '@/components/PortfolioEmailModal'
import { whatsappHref, formatDate } from '@/lib/utils'
import {
  LEAD_STATUS_LABELS,
  LEAD_STATUS_STYLES,
  LEAD_ACTION_TYPE_LABELS,
  type ClientLead,
  type LeadStatus,
  type LeadActionType,
  type LeadNote,
} from '@/lib/types'

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

const ACTION_TYPE_STYLES: Record<LeadActionType, string> = {
  call:    'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  meeting: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200',
  email:   'bg-slate-50 text-slate-600 ring-1 ring-slate-200',
  whatsapp:'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  online:  'bg-sky-50 text-sky-700 ring-1 ring-sky-200',
  other:   'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
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
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${LEAD_STATUS_STYLES[status]}`}>
      {LEAD_STATUS_LABELS[status]}
    </span>
  )
}

function ActionTypeBadge({ type }: { type: LeadActionType }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${ACTION_TYPE_STYLES[type]}`}>
      {ACTION_TYPE_ICONS[type]}
      {LEAD_ACTION_TYPE_LABELS[type]}
    </span>
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
        className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100 transition-colors disabled:opacity-40"
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
        className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-600 ring-1 ring-red-200 hover:bg-red-100 transition-colors disabled:opacity-40"
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
      className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-50 text-slate-400 ring-1 ring-slate-200 hover:bg-slate-100 hover:text-slate-600 transition-colors disabled:opacity-40"
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
    <tr className="bg-brand-50/40">
      <td className="px-3 py-2">
        <input
          autoFocus
          className="w-full text-sm border border-border rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500"
          placeholder="Název firmy *"
          value={form.company_name}
          onChange={e => setForm(prev => ({ ...prev, company_name: e.target.value }))}
        />
      </td>
      <td className="px-3 py-2">
        <input
          className="w-full text-sm border border-border rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500"
          placeholder="Jméno"
          value={form.contact_name ?? ''}
          onChange={e => set('contact_name', e.target.value)}
        />
      </td>
      <td className="px-3 py-2">
        <input
          className="w-full text-sm border border-border rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500"
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
          className="w-full text-sm border border-border rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500"
          placeholder="email@firma.cz"
          value={form.email ?? ''}
          onChange={e => set('email', e.target.value)}
        />
      </td>
      <td className="px-3 py-2">
        <div className="relative">
          <select
            className="w-full text-sm border border-border rounded-md px-2 py-1.5 pr-7 focus:outline-none focus:ring-2 focus:ring-brand-500 appearance-none bg-white"
            value={form.lead_status}
            onChange={e => setForm(prev => ({ ...prev, lead_status: e.target.value as LeadStatus }))}
          >
            {LEAD_STATUSES.map(s => (
              <option key={s} value={s}>{LEAD_STATUS_LABELS[s]}</option>
            ))}
          </select>
          <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        </div>
      </td>
      <td className="px-3 py-2">
        <div className="relative">
          <select
            className="w-full text-sm border border-border rounded-md px-2 py-1.5 pr-7 focus:outline-none focus:ring-2 focus:ring-brand-500 appearance-none bg-white"
            value={form.next_action_type ?? ''}
            onChange={e => set('next_action_type', e.target.value || null)}
          >
            <option value="">— typ —</option>
            {LEAD_ACTION_TYPES.map(t => (
              <option key={t} value={t}>{LEAD_ACTION_TYPE_LABELS[t]}</option>
            ))}
          </select>
          <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        </div>
      </td>
      <td className="px-3 py-2">
        <input
          className="w-full text-sm border border-border rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500"
          placeholder="Zavolat zítra, poslat email…"
          value={form.next_action ?? ''}
          onChange={e => set('next_action', e.target.value)}
        />
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-col gap-1">
          <input
            type="date"
            className="w-full text-sm border border-border rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500"
            value={form.next_action_date ?? ''}
            onChange={e => set('next_action_date', e.target.value)}
          />
          <input
            type="time"
            className="w-full text-sm border border-border rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500"
            value={form.next_action_time ?? ''}
            onChange={e => set('next_action_time', e.target.value)}
          />
        </div>
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-col gap-1">
          <input
            type="number"
            className="w-full text-sm border border-border rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500"
            placeholder="Kč"
            value={form.estimated_value ?? ''}
            onChange={e => set('estimated_value', e.target.value ? Number(e.target.value) : null)}
          />
          <textarea
            className="w-full text-sm border border-border rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
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
            className="p-1.5 rounded-md bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Check size={14} />
          </button>
          <button
            onClick={onCancel}
            className="p-1.5 rounded-md text-muted-foreground hover:bg-slate-100 transition-colors"
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
            className="p-0.5 -ml-1 rounded text-muted-foreground hover:text-brand-700 hover:bg-brand-50 transition-colors shrink-0"
          >
            {expanded
              ? <ChevronDown size={13} strokeWidth={1.5} />
              : <ChevronRight size={13} strokeWidth={1.5} />
            }
          </button>
        ) : (
          <Building2 size={13} className="text-muted-foreground shrink-0" strokeWidth={1.5} />
        )}
        <span className="text-sm font-medium text-foreground">{lead.company_name}</span>
        {lead.calendar_event_id && (
          <span title="Založeno z kalendáře" className="shrink-0 text-brand-500">
            <CalendarDays size={12} strokeWidth={1.5} />
          </span>
        )}
        {noteCount > 0 && (
          <span
            title={lastNote ? `${noteCount}× poznámka — naposledy: ${lastNote.content}` : `${noteCount}× poznámka`}
            className="flex items-center gap-0.5 shrink-0 text-muted-foreground/70"
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
          <User size={12} className="text-muted-foreground shrink-0" strokeWidth={1.5} />
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
        <a href={`tel:${lead.phone}`} className="flex items-center gap-1.5 text-sm text-brand-700 hover:underline">
          <Phone size={12} strokeWidth={1.5} />
          {lead.phone}
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
          <a href={`mailto:${lead.email}`} className="flex items-center gap-1.5 text-sm text-brand-700 hover:underline truncate max-w-[160px]">
            <Mail size={12} strokeWidth={1.5} />
            {lead.email}
          </a>
          {lead.portfolio_sent_at && (
            <span className="flex items-center gap-1 text-[11px] text-emerald-600" title="Portfolio bylo odesláno">
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
        <span className="text-sm font-medium text-foreground">
          {Number(lead.estimated_value).toLocaleString('cs-CZ')} Kč
        </span>
      ) : (
        <span className="text-muted-foreground/50">—</span>
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
      className={`border-t border-border transition-colors group ${
        highlighted ? 'bg-brand-50 ring-2 ring-inset ring-brand-300' : 'hover:bg-slate-50/60'
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
          : <span className="text-muted-foreground/50">—</span>
        }
      </td>
      <td className="px-3 py-2.5">
        <span className="text-sm text-foreground">{lead.next_action ?? <span className="text-muted-foreground/50">—</span>}</span>
      </td>
      <td className="px-3 py-2.5">
        {formattedDateTime ? (
          <div className="flex flex-col gap-0.5">
            <span className={`text-sm font-medium ${isOverdue ? 'text-red-600' : 'text-foreground'}`}>
              {formattedDateTime}
              {isOverdue && ' ⚠'}
            </span>
          </div>
        ) : (
          <span className="text-muted-foreground/50">—</span>
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
              className="p-1.5 rounded-md bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-40"
            >
              <Send size={13} strokeWidth={1.5} />
            </button>
          )}
          {lead.email && (
            <button
              onClick={onOpenCustomMessage}
              disabled={isPending}
              title="Napsat jinou zprávu"
              className="p-1.5 rounded-md text-muted-foreground hover:text-brand-700 hover:bg-brand-50 transition-colors disabled:opacity-40"
            >
              <MessageSquareText size={13} strokeWidth={1.5} />
            </button>
          )}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={onConvert}
              disabled={isPending || lead.lead_status === 'converted'}
              title="Převést na zakázku"
              className="p-1.5 rounded-md text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <FolderPlus size={13} strokeWidth={1.5} />
            </button>
            <button
              onClick={onMoveToWaiting}
              disabled={isPending}
              title="Přesunout do Čekání"
              className="p-1.5 rounded-md text-muted-foreground hover:text-sky-600 hover:bg-sky-50 transition-colors disabled:opacity-40"
            >
              <Clock size={13} strokeWidth={1.5} />
            </button>
            <button
              onClick={onEdit}
              className="p-1.5 rounded-md text-muted-foreground hover:text-brand-700 hover:bg-brand-50 transition-colors"
            >
              <Pencil size={13} strokeWidth={1.5} />
            </button>
            <button
              onClick={onDelete}
              disabled={isPending}
              className="p-1.5 rounded-md text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
            >
              <Trash2 size={13} strokeWidth={1.5} />
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
  const waHref = lead.phone ? whatsappHref(lead.phone) : null
  const [draft, setDraft] = useState('')

  const submit = () => {
    const content = draft.trim()
    if (!content) return
    onAddNote(content)
    setDraft('')
  }

  return (
    <tr className="bg-slate-50/80 border-t border-border">
      <td colSpan={11} className="px-6 py-4">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
          <div className="space-y-3 min-w-0">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <StickyNote size={12} strokeWidth={1.5} />
              Poznámky
            </p>

            <div className="flex flex-col gap-1.5">
              <textarea
                className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none bg-white"
                placeholder="Nový zápisek z hovoru…"
                rows={2}
                value={draft}
                onChange={e => setDraft(e.target.value)}
              />
              <button
                onClick={submit}
                disabled={!draft.trim() || isPending}
                className="self-start flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
                      <div className="w-1.5 h-1.5 rounded-full bg-brand-600 mt-1.5 shrink-0" />
                      {i < notes.length - 1 && <div className="w-px flex-1 bg-brand-100 mt-1" />}
                    </div>
                    <div className="pb-2.5 flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{formatDate(note.created_at)}</span>
                        <button
                          onClick={() => onDeleteNote(note.id)}
                          disabled={isPending}
                          className="opacity-0 group-hover/note:opacity-100 text-muted-foreground hover:text-red-600 transition-opacity disabled:opacity-40"
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
              <p className="text-sm text-muted-foreground/70">Žádné poznámky.</p>
            )}

            <p className="text-xs text-muted-foreground pt-1">
              Kontakt přidán {new Date(lead.created_at).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' })}
              {lead.calendar_event_id && ' · založeno z kalendáře'}
            </p>
          </div>

          <div className="flex flex-wrap gap-2 md:justify-end">
            {lead.phone && (
              <a
                href={`tel:${lead.phone}`}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground bg-white border border-border px-3 py-2 rounded-lg hover:bg-muted transition-colors"
              >
                <Phone size={12} strokeWidth={1.5} />
                Volat
              </a>
            )}
            {lead.email && (
              <a
                href={`mailto:${lead.email}`}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground bg-white border border-border px-3 py-2 rounded-lg hover:bg-muted transition-colors"
              >
                <Mail size={12} strokeWidth={1.5} />
                Napsat
              </a>
            )}
            {waHref && (
              <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-700 bg-white border border-green-200 px-3 py-2 rounded-lg hover:bg-green-50 transition-colors"
              >
                <MessageCircle size={12} strokeWidth={1.5} />
                WhatsApp
              </a>
            )}
            {!lead.phone && !lead.email && (
              <span className="text-xs text-muted-foreground/70">Kontakt nemá telefon ani e-mail.</span>
            )}
          </div>
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
    <tr className="bg-sky-50/40">
      <td className="px-3 py-2">
        <input
          autoFocus
          className="w-full text-sm border border-border rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-sky-500"
          placeholder="Název firmy *"
          value={form.company_name}
          onChange={e => setForm(prev => ({ ...prev, company_name: e.target.value }))}
        />
      </td>
      <td className="px-3 py-2">
        <input
          className="w-full text-sm border border-border rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-sky-500"
          placeholder="Jméno"
          value={form.contact_name ?? ''}
          onChange={e => set('contact_name', e.target.value)}
        />
      </td>
      <td className="px-3 py-2">
        <input
          className="w-full text-sm border border-border rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-sky-500"
          placeholder="+420…"
          value={form.phone ?? ''}
          onChange={e => set('phone', e.target.value)}
        />
      </td>
      <td className="px-3 py-2">
        <input
          type="email"
          className="w-full text-sm border border-border rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-sky-500"
          placeholder="email@firma.cz"
          value={form.email ?? ''}
          onChange={e => set('email', e.target.value)}
        />
      </td>
      <td className="px-3 py-2">
        <textarea
          className="w-full text-sm border border-border rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none"
          placeholder="Shrnutí (kontext leadu)…"
          value={form.notes ?? ''}
          rows={2}
          onChange={e => set('notes', e.target.value)}
        />
      </td>
      <td className="px-3 py-2">
        <input
          type="number"
          className="w-full text-sm border border-border rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-sky-500"
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
            className="p-1.5 rounded-md bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Check size={14} />
          </button>
          <button
            onClick={onCancel}
            className="p-1.5 rounded-md text-muted-foreground hover:bg-slate-100 transition-colors"
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
      className={`border-t border-border transition-colors group ${
        highlighted ? 'bg-sky-50 ring-2 ring-inset ring-sky-300' : 'hover:bg-slate-50/60'
      }`}
    >
      <CompanyCell lead={lead} notes={notes} />
      <ContactCell lead={lead} />
      <PhoneCell lead={lead} />
      <EmailCell lead={lead} />
      <td className="px-3 py-2.5">
        {lastNote ? (
          <span className="text-sm text-muted-foreground truncate max-w-[200px] block">{lastNote.content}</span>
        ) : (
          <span className="text-muted-foreground/40">—</span>
        )}
      </td>
      <ValueCell lead={lead} />
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={onConvert}
            disabled={isPending}
            title="Převést na zakázku"
            className="p-1.5 rounded-md text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <FolderPlus size={13} strokeWidth={1.5} />
          </button>
          <button
            onClick={onMoveBack}
            disabled={isPending}
            title="Vrátit zpět do Hovorů"
            className="p-1.5 rounded-md text-muted-foreground hover:text-amber-600 hover:bg-amber-50 transition-colors disabled:opacity-40"
          >
            <Undo2 size={13} strokeWidth={1.5} />
          </button>
          <button
            onClick={onEdit}
            title="Upravit"
            className="p-1.5 rounded-md text-muted-foreground hover:text-sky-600 hover:bg-sky-50 transition-colors"
          >
            <Pencil size={13} strokeWidth={1.5} />
          </button>
          <button
            onClick={onDelete}
            disabled={isPending}
            className="p-1.5 rounded-md text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
          >
            <Trash2 size={13} strokeWidth={1.5} />
          </button>
        </div>
      </td>
    </tr>
  )
}

export default function LeadsTable({
  initialLeads,
  initialNotes,
  focusLeadId,
}: {
  initialLeads: ClientLead[]
  initialNotes: LeadNote[]
  focusLeadId?: string
}) {
  const [leads, setLeads] = useState<ClientLead[]>(initialLeads)
  const [notes, setNotes] = useState<LeadNote[]>(initialNotes)
  const [addingNew, setAddingNew] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingWaitingId, setEditingWaitingId] = useState<string | null>(null)
  const [portfolioModalLead, setPortfolioModalLead] = useState<ClientLead | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [highlightedId, setHighlightedId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const notesByLead = useMemo(() => {
    const map = new Map<string, LeadNote[]>()
    for (const note of notes) {
      const list = map.get(note.lead_id)
      if (list) list.push(note)
      else map.set(note.lead_id, [note])
    }
    return map
  }, [notes])

  // Příchod z kalendáře (`?lead=ID`): kontakt rozbalit, odscrollovat na něj
  // a na chvíli zvýraznit, ať je v široké tabulce vidět, o který řádek jde.
  useEffect(() => {
    if (!focusLeadId) return
    if (!initialLeads.some(l => l.id === focusLeadId)) return

    setExpandedId(focusLeadId)
    setHighlightedId(focusLeadId)

    const scroll = requestAnimationFrame(() => {
      document.getElementById(`lead-${focusLeadId}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
    const fade = setTimeout(() => setHighlightedId(null), 4000)

    return () => {
      cancelAnimationFrame(scroll)
      clearTimeout(fade)
    }
  }, [focusLeadId, initialLeads])

  const activeLeads = leads.filter(l => l.lead_status !== 'waiting')
  const waitingLeads = leads.filter(l => l.lead_status === 'waiting')

  const handleCreate = (data: LeadPayload) => {
    startTransition(async () => {
      const created = await createLead(data)
      const newLead: ClientLead = {
        ...data,
        id: created.id,
        call_answered: null,
        reminder_day_before_sent: false,
        reminder_2h_before_sent: false,
        portfolio_sent_at: null,
        calendar_event_id: null,
        created_at: created.created_at,
        updated_at: null,
      }
      setLeads(prev => [newLead, ...prev])
      setAddingNew(false)
    })
  }

  const handleUpdate = (id: string, data: LeadPayload) => {
    startTransition(async () => {
      const result = await updateLead(id, data)
      setLeads(prev =>
        prev.map(l => l.id === id ? { ...l, ...data, ...result } : l)
      )
      setEditingId(null)
      setEditingWaitingId(null)
    })
  }

  const handleDelete = (id: string) => {
    if (!confirm('Opravdu smazat tento kontakt?')) return
    startTransition(async () => {
      await deleteLead(id)
      setLeads(prev => prev.filter(l => l.id !== id))
    })
  }

  const handleConvert = (id: string) => {
    if (!confirm('Převést kontakt na novou zakázku? Lead bude označen jako Převeden.')) return
    startTransition(async () => {
      await convertLeadToProject(id)
    })
  }

  const handleMoveToWaiting = (id: string) => {
    startTransition(async () => {
      await moveLeadToWaiting(id)
      setLeads(prev => prev.map(l => l.id === id ? { ...l, lead_status: 'waiting' as const, updated_at: new Date() } : l))
    })
  }

  const handleMoveFromWaiting = (id: string) => {
    startTransition(async () => {
      await moveLeadFromWaiting(id)
      setLeads(prev => prev.map(l => l.id === id ? { ...l, lead_status: 'cold' as const, updated_at: new Date() } : l))
    })
  }

  const handleToggleAnswered = (id: string, val: boolean | null) => {
    startTransition(async () => {
      await setCallAnswered(id, val)
      setLeads(prev => prev.map(l => l.id === id ? { ...l, call_answered: val, updated_at: new Date() } : l))
    })
  }

  const handlePortfolioSent = (id: string) => {
    setLeads(prev => prev.map(l => l.id === id ? { ...l, portfolio_sent_at: new Date() } : l))
  }

  const handleSendPortfolio = (id: string) => {
    startTransition(async () => {
      const result = await sendPortfolioEmail(id)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success('Portfolio odesláno')
      handlePortfolioSent(id)
    })
  }

  const handleAddNote = (leadId: string, content: string) => {
    startTransition(async () => {
      const created = await addLeadNote(leadId, content)
      const newNote: LeadNote = { id: created.id, lead_id: leadId, content, created_at: created.created_at }
      setNotes(prev => [newNote, ...prev])
    })
  }

  const handleDeleteNote = (id: string) => {
    startTransition(async () => {
      await deleteLeadNote(id)
      setNotes(prev => prev.filter(n => n.id !== id))
    })
  }

  return (
    <div className="space-y-8">
      {/* Hovory */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Hovory s klienty</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {activeLeads.length} {activeLeads.length === 1 ? 'kontakt' : activeLeads.length < 5 ? 'kontakty' : 'kontaktů'}
              {activeLeads.filter(l => l.next_action_date && new Date(l.next_action_date) < new Date(new Date().toDateString())).length > 0 && (
                <span className="ml-2 text-red-600 font-medium">
                  · {activeLeads.filter(l => l.next_action_date && new Date(l.next_action_date) < new Date(new Date().toDateString())).length} po termínu
                </span>
              )}
            </p>
          </div>
          <button
            onClick={() => { setAddingNew(true); setEditingId(null) }}
            disabled={addingNew}
            className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
          >
            <Plus size={14} />
            Přidat kontakt
          </button>
        </div>

        <div className="border border-border rounded-xl overflow-hidden bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[1100px]">
              <thead>
                <tr className="bg-slate-50 border-b border-border">
                  <th className="px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Firma</th>
                  <th className="px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Kontakt</th>
                  <th className="px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Telefon</th>
                  <th className="px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Zvedl?</th>
                  <th className="px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Email</th>
                  <th className="px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Zájem</th>
                  <th className="px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Typ akce</th>
                  <th className="px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Příští akce</th>
                  <th className="px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Datum & čas</th>
                  <th className="px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Odhad hodnoty</th>
                  <th className="px-3 py-2.5 w-24" />
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
                {activeLeads.length === 0 && !addingNew && (
                  <tr>
                    <td colSpan={11} className="px-4 py-12 text-center text-sm text-muted-foreground">
                      Zatím žádné kontakty. Klikni na&nbsp;<strong>Přidat kontakt</strong>&nbsp;a začni evidovat hovory.
                    </td>
                  </tr>
                )}
                {activeLeads.map(lead =>
                  editingId === lead.id ? (
                    <LeadForm
                      key={lead.id}
                      initial={{
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
                      }}
                      onSave={(data) => handleUpdate(lead.id, data)}
                      onCancel={() => setEditingId(null)}
                      isPending={isPending}
                    />
                  ) : (
                    <LeadRow
                      key={lead.id}
                      lead={lead}
                      notes={notesByLead.get(lead.id) ?? []}
                      onEdit={() => { setEditingId(lead.id); setAddingNew(false) }}
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
                      onToggleExpand={() => setExpandedId(prev => prev === lead.id ? null : lead.id)}
                      highlighted={highlightedId === lead.id}
                    />
                  )
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Čekání */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-sky-600" strokeWidth={1.5} />
            <h2 className="text-lg font-semibold text-foreground">Čekání na odpověď</h2>
          </div>
          {waitingLeads.length > 0 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-sky-50 text-sky-700 ring-1 ring-sky-200">
              {waitingLeads.length}
            </span>
          )}
          <p className="text-sm text-muted-foreground">
            — podniky, kde čekáš jestli se ozví
          </p>
        </div>

        <div className="border border-border rounded-xl overflow-hidden bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[700px]">
              <thead>
                <tr className="bg-sky-50/60 border-b border-border">
                  <th className="px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Firma</th>
                  <th className="px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Kontakt</th>
                  <th className="px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Telefon</th>
                  <th className="px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Email</th>
                  <th className="px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Poznámka</th>
                  <th className="px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Odhad hodnoty</th>
                  <th className="px-3 py-2.5 w-24" />
                </tr>
              </thead>
              <tbody>
                {waitingLeads.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">
                      Žádné podniky nečekají na odpověď. Přesuň kontakt z&nbsp;Hovorů kliknutím na&nbsp;<Clock size={12} className="inline" strokeWidth={1.5} />&nbsp;ikonku.
                    </td>
                  </tr>
                )}
                {waitingLeads.map(lead =>
                  editingWaitingId === lead.id ? (
                    <WaitingLeadForm
                      key={lead.id}
                      initial={{
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
                      }}
                      onSave={(data) => handleUpdate(lead.id, data)}
                      onCancel={() => setEditingWaitingId(null)}
                      isPending={isPending}
                    />
                  ) : (
                    <WaitingRow
                      key={lead.id}
                      lead={lead}
                      notes={notesByLead.get(lead.id) ?? []}
                      onEdit={() => { setEditingWaitingId(lead.id); setEditingId(null) }}
                      onConvert={() => handleConvert(lead.id)}
                      onMoveBack={() => handleMoveFromWaiting(lead.id)}
                      onDelete={() => handleDelete(lead.id)}
                      isPending={isPending}
                      highlighted={highlightedId === lead.id}
                    />
                  )
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <PortfolioEmailModal
        isOpen={!!portfolioModalLead}
        lead={portfolioModalLead}
        onClose={() => setPortfolioModalLead(null)}
        onSent={() => portfolioModalLead && handlePortfolioSent(portfolioModalLead.id)}
      />
    </div>
  )
}
