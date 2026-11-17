'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/components/ui/toast'
import { Card } from '@/components/admin/card'
import { saveRecurringInvoice, toggleRecurringInvoice } from '@/app/dashboard/faktury/koncepty-actions'
import { periodLabel } from '@/lib/admin/invoice-draft-schema'
import type { RecurringInvoice } from '@/lib/admin/invoice-drafts'
import type { InvoiceProjectOption } from '@/app/dashboard/finance/invoice-actions'
import { INVOICE_CURRENCIES } from '@/lib/invoice-constants'

/**
 * Pravidelné faktury (R-117): správa webu, hosting, paušál. Každý měsíc
 * v nastavený den se připraví koncept do Faktur › Ke schválení. **Nic
 * neodchází samo** — odeslání je pořád jedno kliknutí člověka.
 */

type ItemDraft = { description: string; quantity: string; unitPrice: string }

type FormState = {
  label: string
  projectId: string
  name: string
  address: string
  ico: string
  dic: string
  email: string
  items: ItemDraft[]
  currency: string
  dueDays: string
  dayOfMonth: string
}

const EMPTY: FormState = {
  label: '',
  projectId: '',
  name: '',
  address: '',
  ico: '',
  dic: '',
  email: '',
  items: [{ description: '', quantity: '1', unitPrice: '' }],
  currency: 'CZK',
  dueDays: '14',
  dayOfMonth: '1',
}

function fromRecurring(r: RecurringInvoice): FormState {
  return {
    label: r.label,
    projectId: r.projectId ?? '',
    name: r.counterparty.name,
    address: r.counterparty.address,
    ico: r.counterparty.ico,
    dic: r.counterparty.dic,
    email: r.email,
    items: r.items.map(item => ({
      description: item.description,
      quantity: String(item.quantity),
      unitPrice: String(item.unitPrice),
    })),
    currency: r.currency,
    dueDays: String(r.dueDays),
    dayOfMonth: String(r.dayOfMonth),
  }
}

const toNumber = (value: string): number => {
  const parsed = Number(value.replace(',', '.').replace(/\s/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function money(amount: number, currency: string): string {
  return new Intl.NumberFormat('cs-CZ', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount)
}

const SELECT =
  'h-11 w-full rounded-chip border border-input bg-surface px-3.5 text-[15px] text-ink transition-colors focus-visible:border-navy-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30'

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-sm font-medium text-ink">{label}</span>
      {children}
      {hint && <span className="text-xs text-quiet">{hint}</span>}
    </label>
  )
}

export function RecurringManager({
  recurring,
  projects,
  vatPayer,
}: {
  recurring: RecurringInvoice[]
  projects: InvoiceProjectOption[]
  vatPayer: boolean
}) {
  const [editing, setEditing] = useState<string | 'new' | null>(recurring.length === 0 ? 'new' : null)

  return (
    <div className="flex flex-col gap-4">
      {recurring.map(item =>
        editing === item.id ? (
          <RecurringForm
            key={item.id}
            id={item.id}
            initial={fromRecurring(item)}
            projects={projects}
            vatPayer={vatPayer}
            onDone={() => setEditing(null)}
          />
        ) : (
          <RecurringRow key={item.id} item={item} onEdit={() => setEditing(item.id)} />
        ),
      )}

      {editing === 'new' ? (
        <RecurringForm
          id={null}
          initial={EMPTY}
          projects={projects}
          vatPayer={vatPayer}
          onDone={() => setEditing(null)}
        />
      ) : (
        <div>
          <Button type="button" variant="outline" onClick={() => setEditing('new')}>
            <Plus size={16} strokeWidth={1.75} aria-hidden />
            Přidat pravidelnou fakturu
          </Button>
        </div>
      )}
    </div>
  )
}

function RecurringRow({ item, onEdit }: { item: RecurringInvoice; onEdit: () => void }) {
  const router = useRouter()
  const [pending, start] = useTransition()

  const toggle = () => {
    start(async () => {
      const result = await toggleRecurringInvoice(item.id, !item.active)
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success(item.active ? 'Pozastaveno' : 'Zapnuto', {
        description: item.active ? 'Další koncepty se nepřipraví, dokud ji nezapnete.' : undefined,
      })
      router.refresh()
    })
  }

  return (
    <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[15px] font-semibold text-ink">{item.label}</span>
          {!item.active && <Badge variant="outline">Pozastaveno</Badge>}
        </div>
        <p className="mt-0.5 text-sm text-quiet">
          {item.counterparty.name} · každý měsíc od {item.dayOfMonth}. dne
          {item.lastPeriod ? ` · naposledy ${periodLabel(item.lastPeriod)}` : ''}
        </p>
        {!item.email && <p className="mt-1 text-sm text-ink">Chybí e-mail — doplníte ho u konceptu, nebo tady.</p>}
      </div>
      <p className="font-num text-[17px] font-semibold tabular-nums text-ink">{money(item.total, item.currency)}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={onEdit}>
          Upravit
        </Button>
        <Button type="button" variant="ghost" onClick={toggle} disabled={pending}>
          {item.active ? 'Pozastavit' : 'Zapnout'}
        </Button>
      </div>
    </Card>
  )
}

function RecurringForm({
  id,
  initial,
  projects,
  vatPayer,
  onDone,
}: {
  id: string | null
  initial: FormState
  projects: InvoiceProjectOption[]
  vatPayer: boolean
  onDone: () => void
}) {
  const router = useRouter()
  const [form, setForm] = useState<FormState>(initial)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const set = (patch: Partial<FormState>) => setForm(prev => ({ ...prev, ...patch }))
  const setItem = (index: number, patch: Partial<ItemDraft>) =>
    setForm(prev => ({ ...prev, items: prev.items.map((item, i) => (i === index ? { ...item, ...patch } : item)) }))

  const total = form.items.reduce((sum, item) => sum + toNumber(item.quantity) * toNumber(item.unitPrice), 0)

  const submit = () => {
    setError(null)
    start(async () => {
      const result = await saveRecurringInvoice(id, {
        label: form.label,
        projectId: form.projectId === '' ? null : form.projectId,
        counterparty: { name: form.name, address: form.address, ico: form.ico, dic: form.dic },
        email: form.email.trim(),
        items: form.items.map(item => ({
          description: item.description,
          quantity: toNumber(item.quantity),
          unitPrice: toNumber(item.unitPrice),
          vatRate: vatPayer ? 21 : 0,
        })),
        currency: form.currency,
        dueDays: Math.round(toNumber(form.dueDays)),
        dayOfMonth: Math.round(toNumber(form.dayOfMonth)),
      })
      if (result.error) {
        setError(result.error)
        return
      }
      toast.success(id ? 'Pravidelná faktura uložená' : 'Pravidelná faktura přidaná', {
        description: 'Koncept se připraví v nastavený den a počká na vaše schválení.',
      })
      onDone()
      router.refresh()
    })
  }

  return (
    <Card>
      <form
        className="flex flex-col gap-4"
        onSubmit={event => {
          event.preventDefault()
          submit()
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Název" hint="Jen pro vás, třeba „Správa webu — Kavárna“.">
            <Input value={form.label} onChange={e => set({ label: e.target.value })} required maxLength={160} />
          </Field>
          <Field label="Zakázka" hint="Nepovinné. Faktury se pak ukážou u zakázky.">
            <select value={form.projectId} onChange={e => set({ projectId: e.target.value })} className={SELECT}>
              <option value="">Bez zakázky</option>
              {projects.map(project => (
                <option key={project.id} value={project.id}>
                  {project.client_name}
                  {project.description ? ` — ${project.description}` : ''}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Odběratel">
            <Input value={form.name} onChange={e => set({ name: e.target.value })} required maxLength={160} />
          </Field>
          <Field label="E-mail pro fakturu">
            <Input type="email" value={form.email} onChange={e => set({ email: e.target.value })} placeholder="adresa@klient.cz" />
          </Field>
          <Field label="Adresa">
            <Input value={form.address} onChange={e => set({ address: e.target.value })} maxLength={400} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="IČO">
              <Input
                value={form.ico}
                inputMode="numeric"
                maxLength={8}
                onChange={e => set({ ico: e.target.value.replace(/\D/g, '').slice(0, 8) })}
              />
            </Field>
            <Field label="DIČ">
              <Input value={form.dic} onChange={e => set({ dic: e.target.value })} maxLength={20} />
            </Field>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {form.items.map((item, index) => (
            <div key={index} className="grid gap-3 sm:grid-cols-[1fr_5rem_8rem_auto] sm:items-end">
              <Field label={index === 0 ? 'Co fakturujete' : ''}>
                <Input
                  value={item.description}
                  placeholder="Správa webu"
                  onChange={e => setItem(index, { description: e.target.value })}
                  required
                  aria-label={`Popis položky ${index + 1}`}
                />
              </Field>
              <Field label={index === 0 ? 'Počet' : ''}>
                <Input
                  value={item.quantity}
                  inputMode="decimal"
                  onChange={e => setItem(index, { quantity: e.target.value })}
                  aria-label={`Počet u položky ${index + 1}`}
                />
              </Field>
              <Field label={index === 0 ? 'Cena za kus' : ''}>
                <Input
                  value={item.unitPrice}
                  inputMode="decimal"
                  placeholder="0"
                  onChange={e => setItem(index, { unitPrice: e.target.value })}
                  aria-label={`Cena za kus u položky ${index + 1}`}
                />
              </Field>
              <div className="flex justify-end">
                {form.items.length > 1 && (
                  <button
                    type="button"
                    aria-label="Smazat položku"
                    className="flex h-11 w-11 items-center justify-center rounded-chip text-quiet hover:text-ink"
                    onClick={() => set({ items: form.items.filter((_, i) => i !== index) })}
                  >
                    <Trash2 size={16} strokeWidth={1.75} />
                  </button>
                )}
              </div>
            </div>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => set({ items: [...form.items, { description: '', quantity: '1', unitPrice: '' }] })}
            >
              <Plus size={16} strokeWidth={1.75} aria-hidden />
              Další položka
            </Button>
            <p className="font-num text-[17px] font-semibold tabular-nums text-ink">Celkem {money(total, form.currency)}</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Den v měsíci" hint="1 až 28. Ten den se připraví koncept.">
            <Input value={form.dayOfMonth} inputMode="numeric" onChange={e => set({ dayOfMonth: e.target.value })} />
          </Field>
          <Field label="Splatnost (dní)">
            <Input value={form.dueDays} inputMode="numeric" onChange={e => set({ dueDays: e.target.value })} />
          </Field>
          <Field label="Měna">
            <select value={form.currency} onChange={e => set({ currency: e.target.value })} className={SELECT}>
              {INVOICE_CURRENCIES.map(code => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? 'Ukládám…' : 'Uložit'}
          </Button>
          <Button type="button" variant="ghost" onClick={onDone}>
            Zpět
          </Button>
        </div>
      </form>
    </Card>
  )
}
