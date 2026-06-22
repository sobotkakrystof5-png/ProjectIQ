'use client'

import { useState, useTransition } from 'react'
import { Plus, Trash2, Pencil, Check, X, Phone, Mail, Building2, User, ChevronDown, FolderPlus, PhoneCall, Users, AtSign, MessageCircle, Video, MoreHorizontal, Clock, Undo2, PhoneOff, PhoneMissed } from 'lucide-react'
import { createLead, updateLead, deleteLead, convertLeadToProject, setCallAnswered, moveLeadToWaiting, moveLeadFromWaiting } from '@/app/calls-actions'
import type { LeadPayload } from '@/app/calls-actions'
import {
  LEAD_STATUS_LABELS,
  LEAD_STATUS_STYLES,
  LEAD_ACTION_TYPE_LABELS,
  type ClientLead,
  type LeadStatus,
  type LeadActionType,
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
        <Check size={11} strokeWidth={2.5} />
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
        <X size={11} strokeWidth={2.5} />
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
        <input
          type="number"
          className="w-full text-sm border border-border rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500"
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

function LeadRow({
  lead,
  onEdit,
  onDelete,
  onConvert,
  onMoveToWaiting,
  onToggleAnswered,
  isPending,
}: {
  lead: ClientLead
  onEdit: () => void
  onDelete: () => void
  onConvert: () => void
  onMoveToWaiting: () => void
  onToggleAnswered: (val: boolean | null) => void
  isPending: boolean
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
    <tr className="border-t border-border hover:bg-slate-50/60 transition-colors group">
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Building2 size={13} className="text-muted-foreground shrink-0" strokeWidth={1.5} />
          <span className="text-sm font-medium text-foreground">{lead.company_name}</span>
        </div>
      </td>
      <td className="px-3 py-2.5">
        {lead.contact_name && (
          <div className="flex items-center gap-1.5">
            <User size={12} className="text-muted-foreground shrink-0" strokeWidth={1.5} />
            <span className="text-sm text-foreground">{lead.contact_name}</span>
          </div>
        )}
      </td>
      <td className="px-3 py-2.5">
        {lead.phone && (
          <a href={`tel:${lead.phone}`} className="flex items-center gap-1.5 text-sm text-brand-700 hover:underline">
            <Phone size={12} strokeWidth={1.5} />
            {lead.phone}
          </a>
        )}
      </td>
      <td className="px-3 py-2.5">
        <CallAnsweredToggle
          answered={lead.call_answered}
          onClick={onToggleAnswered}
          isPending={isPending}
        />
      </td>
      <td className="px-3 py-2.5">
        {lead.email && (
          <a href={`mailto:${lead.email}`} className="flex items-center gap-1.5 text-sm text-brand-700 hover:underline truncate max-w-[160px]">
            <Mail size={12} strokeWidth={1.5} />
            {lead.email}
          </a>
        )}
      </td>
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
      <td className="px-3 py-2.5">
        {lead.estimated_value != null ? (
          <span className="text-sm font-medium text-foreground">
            {Number(lead.estimated_value).toLocaleString('cs-CZ')} Kč
          </span>
        ) : (
          <span className="text-muted-foreground/50">—</span>
        )}
      </td>
      <td className="px-3 py-2.5">
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
      </td>
    </tr>
  )
}

function WaitingRow({
  lead,
  onConvert,
  onMoveBack,
  onDelete,
  isPending,
}: {
  lead: ClientLead
  onConvert: () => void
  onMoveBack: () => void
  onDelete: () => void
  isPending: boolean
}) {
  return (
    <tr className="border-t border-border hover:bg-slate-50/60 transition-colors group">
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Building2 size={13} className="text-muted-foreground shrink-0" strokeWidth={1.5} />
          <span className="text-sm font-medium text-foreground">{lead.company_name}</span>
        </div>
      </td>
      <td className="px-3 py-2.5">
        {lead.contact_name && (
          <div className="flex items-center gap-1.5">
            <User size={12} className="text-muted-foreground shrink-0" strokeWidth={1.5} />
            <span className="text-sm text-foreground">{lead.contact_name}</span>
          </div>
        )}
      </td>
      <td className="px-3 py-2.5">
        {lead.phone && (
          <a href={`tel:${lead.phone}`} className="flex items-center gap-1.5 text-sm text-brand-700 hover:underline">
            <Phone size={12} strokeWidth={1.5} />
            {lead.phone}
          </a>
        )}
      </td>
      <td className="px-3 py-2.5">
        {lead.email && (
          <a href={`mailto:${lead.email}`} className="flex items-center gap-1.5 text-sm text-brand-700 hover:underline truncate max-w-[160px]">
            <Mail size={12} strokeWidth={1.5} />
            {lead.email}
          </a>
        )}
      </td>
      <td className="px-3 py-2.5">
        {lead.notes ? (
          <span className="text-sm text-muted-foreground truncate max-w-[200px] block">{lead.notes}</span>
        ) : (
          <span className="text-muted-foreground/40">—</span>
        )}
      </td>
      <td className="px-3 py-2.5">
        {lead.estimated_value != null ? (
          <span className="text-sm font-medium text-foreground">
            {Number(lead.estimated_value).toLocaleString('cs-CZ')} Kč
          </span>
        ) : (
          <span className="text-muted-foreground/50">—</span>
        )}
      </td>
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

export default function LeadsTable({ initialLeads }: { initialLeads: ClientLead[] }) {
  const [leads, setLeads] = useState<ClientLead[]>(initialLeads)
  const [addingNew, setAddingNew] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const activeLeads = leads.filter(l => l.lead_status !== 'waiting')
  const waitingLeads = leads.filter(l => l.lead_status === 'waiting')

  const handleCreate = (data: LeadPayload) => {
    startTransition(async () => {
      await createLead(data)
      const tempId = crypto.randomUUID()
      const newLead: ClientLead = {
        ...data,
        id: tempId,
        call_answered: null,
        reminder_day_before_sent: false,
        reminder_2h_before_sent: false,
        created_at: new Date(),
        updated_at: null,
      }
      setLeads(prev => [newLead, ...prev])
      setAddingNew(false)
    })
  }

  const handleUpdate = (id: string, data: LeadPayload) => {
    startTransition(async () => {
      await updateLead(id, data)
      setLeads(prev =>
        prev.map(l => l.id === id ? {
          ...l, ...data,
          reminder_day_before_sent: false,
          reminder_2h_before_sent: false,
          updated_at: new Date(),
        } : l)
      )
      setEditingId(null)
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
                      onEdit={() => { setEditingId(lead.id); setAddingNew(false) }}
                      onDelete={() => handleDelete(lead.id)}
                      onConvert={() => handleConvert(lead.id)}
                      onMoveToWaiting={() => handleMoveToWaiting(lead.id)}
                      onToggleAnswered={(val) => handleToggleAnswered(lead.id, val)}
                      isPending={isPending}
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
                {waitingLeads.map(lead => (
                  <WaitingRow
                    key={lead.id}
                    lead={lead}
                    onConvert={() => handleConvert(lead.id)}
                    onMoveBack={() => handleMoveFromWaiting(lead.id)}
                    onDelete={() => handleDelete(lead.id)}
                    isPending={isPending}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
