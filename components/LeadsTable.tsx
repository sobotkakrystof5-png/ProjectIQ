'use client'

import { useState, useTransition } from 'react'
import { Plus, Trash2, Pencil, Check, X, Phone, Mail, Building2, User, ChevronDown, FolderPlus } from 'lucide-react'
import { createLead, updateLead, deleteLead, convertLeadToProject } from '@/app/calls-actions'
import type { LeadPayload } from '@/app/calls-actions'
import { LEAD_STATUS_LABELS, LEAD_STATUS_STYLES, type ClientLead, type LeadStatus } from '@/lib/types'

const LEAD_STATUSES: LeadStatus[] = ['cold', 'warm', 'hot', 'converted', 'lost']

const EMPTY_FORM: LeadPayload = {
  company_name: '',
  contact_name: null,
  phone: null,
  email: null,
  lead_status: 'cold',
  next_action: null,
  next_action_date: null,
  notes: null,
  estimated_value: null,
}

function StatusBadge({ status }: { status: LeadStatus }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${LEAD_STATUS_STYLES[status]}`}>
      {LEAD_STATUS_LABELS[status]}
    </span>
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
        <input
          className="w-full text-sm border border-border rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500"
          placeholder="Zavolat zítra, poslat email…"
          value={form.next_action ?? ''}
          onChange={e => set('next_action', e.target.value)}
        />
      </td>
      <td className="px-3 py-2">
        <input
          type="date"
          className="w-full text-sm border border-border rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500"
          value={form.next_action_date ?? ''}
          onChange={e => set('next_action_date', e.target.value)}
        />
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
  isPending,
}: {
  lead: ClientLead
  onEdit: () => void
  onDelete: () => void
  onConvert: () => void
  isPending: boolean
}) {
  const isOverdue = lead.next_action_date
    ? new Date(lead.next_action_date) < new Date()
    : false

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
        <StatusBadge status={lead.lead_status} />
      </td>
      <td className="px-3 py-2.5">
        <span className="text-sm text-foreground">{lead.next_action ?? <span className="text-muted-foreground/50">—</span>}</span>
      </td>
      <td className="px-3 py-2.5">
        {lead.next_action_date ? (
          <span className={`text-sm ${isOverdue ? 'text-red-600 font-medium' : 'text-foreground'}`}>
            {new Date(lead.next_action_date).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short' })}
            {isOverdue && ' ⚠'}
          </span>
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

export default function LeadsTable({ initialLeads }: { initialLeads: ClientLead[] }) {
  const [leads, setLeads] = useState<ClientLead[]>(initialLeads)
  const [addingNew, setAddingNew] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleCreate = (data: LeadPayload) => {
    startTransition(async () => {
      await createLead(data)
      const tempId = crypto.randomUUID()
      const newLead: ClientLead = {
        ...data,
        id: tempId,
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
        prev.map(l => l.id === id ? { ...l, ...data, updated_at: new Date() } : l)
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

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Hovory s klienty</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {leads.length} {leads.length === 1 ? 'kontakt' : leads.length < 5 ? 'kontakty' : 'kontaktů'}
            {leads.filter(l => l.next_action_date && new Date(l.next_action_date) < new Date()).length > 0 && (
              <span className="ml-2 text-red-600 font-medium">
                · {leads.filter(l => l.next_action_date && new Date(l.next_action_date) < new Date()).length} po termínu
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
          <table className="w-full text-left min-w-[900px]">
            <thead>
              <tr className="bg-slate-50 border-b border-border">
                <th className="px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Firma</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Kontakt</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Telefon</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Email</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Zájem</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Příští akce</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Datum</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Odhad hodnoty</th>
                <th className="px-3 py-2.5 w-20" />
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
              {leads.length === 0 && !addingNew && (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    Zatím žádné kontakty. Klikni na&nbsp;<strong>Přidat kontakt</strong>&nbsp;a začni evidovat hovory.
                  </td>
                </tr>
              )}
              {leads.map(lead =>
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
                      notes: lead.notes,
                      estimated_value: lead.estimated_value,
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
                    isPending={isPending}
                  />
                )
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
