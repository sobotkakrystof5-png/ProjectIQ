'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Search, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import { itemTotals, invoiceTotal } from '@/lib/invoice-pdf/totals'
import { issueNewInvoice, lookupCompany } from '@/app/dashboard/finance/invoice-actions'
import type { InvoiceProjectOption } from '@/app/dashboard/finance/invoice-actions'
import type { IssueDraft } from '@/lib/admin/invoice-issue'
import type { InvoiceIssueItem } from '@/lib/admin/invoice-issue-schema'
import { INVOICE_CURRENCIES } from '@/lib/invoice-constants'

/**
 * Vystavení faktury (AD12). Cíl je hotovo do půl minuty: datum, splatnost
 * i odběratel jsou předvyplněné, zbývá napsat, co fakturuješ.
 *
 * Číslo faktury tu není — přiděluje ho databáze v okamžiku vystavení, aby
 * dvě faktury nikdy nedostaly totéž číslo. Proto ani nejde „uložit rozpracované":
 * doklad vzniká až kliknutím na Vystavit.
 */

type Party = IssueDraft['counterparty']

/**
 * Položka tak, jak se do ní píše: počet a cena jsou **text**, ne číslo.
 *
 * Kdyby to bylo číslo, nešlo by napsat „1,5" — po napsání čárky by se hodnota
 * přečetla jako 1, pole by se překreslilo na „1" a čárka by zmizela. Na číslo
 * se to převádí až při počítání a odesílání.
 */
type ItemDraft = { description: string; quantity: string; unitPrice: string; vatRate: 0 | 12 | 21 }

const emptyItem = (vatRate: 0 | 12 | 21): ItemDraft => ({
  description: '',
  quantity: '1',
  unitPrice: '',
  vatRate,
})

const toItem = (item: ItemDraft): InvoiceIssueItem => ({
  description: item.description,
  quantity: toNumber(item.quantity),
  unitPrice: toNumber(item.unitPrice),
  vatRate: item.vatRate,
})

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-sm font-medium text-ink">{label}</span>
      {children}
      {hint && <span className="text-xs text-quiet">{hint}</span>}
    </label>
  )
}

function money(amount: number, currency: string): string {
  return new Intl.NumberFormat('cs-CZ', { style: 'currency', currency }).format(amount)
}

/** Z pole se čte číslo, ale píše se do něj text — prázdné pole není nula. */
function toNumber(value: string): number {
  const parsed = Number(value.replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : 0
}

export function IssueInvoiceForm({
  draft,
  projects,
  vatPayer,
}: {
  draft: IssueDraft
  projects: InvoiceProjectOption[]
  vatPayer: boolean
}) {
  const router = useRouter()
  const [counterparty, setCounterparty] = useState<Party>(draft.counterparty)
  const [projectId, setProjectId] = useState<string>(draft.projectId ?? '')
  const [issuedOn, setIssuedOn] = useState(draft.issuedOn)
  const [suppliedOn, setSuppliedOn] = useState(draft.suppliedOn)
  const [dueOn, setDueOn] = useState(draft.dueOn)
  const [currency, setCurrency] = useState<string>('CZK')
  const [note, setNote] = useState('')
  // Popis i cena z historie klienta (AD15): co se mu fakturovalo naposledy.
  // Bez toho se u stálého klienta opisovalo totéž pokaždé znovu.
  const [items, setItems] = useState<ItemDraft[]>(() => {
    const vatRate = vatPayer ? 21 : 0
    if (draft.items.length > 0) {
      return draft.items.map((item) => ({
        description: item.description,
        quantity: String(item.quantity),
        unitPrice: String(item.unitPrice),
        vatRate,
      }))
    }
    return [{ ...emptyItem(vatRate), unitPrice: draft.amount > 0 ? String(draft.amount) : '' }]
  })
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const [aresPending, startAres] = useTransition()

  const total = useMemo(() => {
    try {
      return invoiceTotal(items.map(toItem))
    } catch {
      return 0
    }
  }, [items])

  const setItem = (index: number, patch: Partial<ItemDraft>) =>
    setItems(prev => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)))

  const fromAres = () => {
    setError(null)
    startAres(async () => {
      const result = await lookupCompany(counterparty.ico)
      if (result.error || !result.subject) {
        toast.error(result.error ?? 'Firmu se nepodařilo načíst.')
        return
      }
      setCounterparty(prev => ({
        ...prev,
        name: result.subject!.name,
        address: result.subject!.address,
        dic: result.subject!.dic || prev.dic,
      }))
      toast.success('Odběratel doplněn z rejstříku')
    })
  }

  const submit = () => {
    setError(null)
    start(async () => {
      const result = await issueNewInvoice({
        projectId: projectId === '' ? null : projectId,
        counterparty,
        issuedOn,
        suppliedOn,
        dueOn,
        currency,
        items: items.map(toItem),
        note,
      })
      if (result.error || !result.id) {
        setError(result.error ?? 'Fakturu se nepodařilo vystavit.')
        return
      }
      toast.success(`Faktura ${result.number} vystavená`)
      router.push(`/dashboard/faktury/${result.id}`)
    })
  }

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={event => {
        event.preventDefault()
        submit()
      }}
    >
      <section className="flex flex-col gap-4 rounded-box border border-navy-100 bg-surface p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-ink">Odběratel</h2>
        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <Field label="IČO" hint="Doplním jméno a adresu z rejstříku firem.">
            <Input
              value={counterparty.ico}
              inputMode="numeric"
              maxLength={8}
              onChange={e => setCounterparty(p => ({ ...p, ico: e.target.value.replace(/\D/g, '').slice(0, 8) }))}
            />
          </Field>
          <div className="flex items-end">
            <Button type="button" variant="outline" onClick={fromAres} disabled={aresPending || counterparty.ico.length !== 8}>
              <Search size={16} strokeWidth={1.75} />
              {aresPending ? 'Hledám…' : 'Načíst z rejstříku'}
            </Button>
          </div>
        </div>
        <Field label="Jméno nebo firma">
          <Input value={counterparty.name} onChange={e => setCounterparty(p => ({ ...p, name: e.target.value }))} required />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Adresa">
            <Input value={counterparty.address} onChange={e => setCounterparty(p => ({ ...p, address: e.target.value }))} />
          </Field>
          <Field label="DIČ" hint="Nepovinné.">
            <Input value={counterparty.dic} onChange={e => setCounterparty(p => ({ ...p, dic: e.target.value }))} />
          </Field>
        </div>
      </section>

      <section className="flex flex-col gap-4 rounded-box border border-navy-100 bg-surface p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-ink">Co fakturujete</h2>
        <div className="flex flex-col gap-3">
          {items.map((item, index) => (
            <div key={index} className="grid gap-3 sm:grid-cols-[1fr_5rem_8rem_auto] sm:items-end">
              <Field label={index === 0 ? 'Popis' : ''}>
                <Input
                  value={item.description}
                  placeholder="Web na míru, srpen"
                  onChange={e => setItem(index, { description: e.target.value })}
                  required
                />
              </Field>
              <Field label={index === 0 ? 'Počet' : ''}>
                <Input
                  value={item.quantity}
                  inputMode="decimal"
                  aria-label={`Počet u položky ${index + 1}`}
                  onChange={e => setItem(index, { quantity: e.target.value })}
                />
              </Field>
              <Field label={index === 0 ? 'Cena za kus' : ''}>
                <Input
                  value={item.unitPrice}
                  inputMode="decimal"
                  placeholder="0"
                  aria-label={`Cena za kus u položky ${index + 1}`}
                  onChange={e => setItem(index, { unitPrice: e.target.value })}
                />
              </Field>
              <div className="flex items-center justify-between gap-3 sm:justify-end">
                <span className="font-num text-sm tabular-nums text-ink">{money(itemTotals(toItem(item)).total, currency)}</span>
                {items.length > 1 && (
                  <button
                    type="button"
                    aria-label="Smazat položku"
                    className="flex h-11 w-11 items-center justify-center rounded-chip text-quiet hover:text-ink"
                    onClick={() => setItems(prev => prev.filter((_, i) => i !== index))}
                  >
                    <Trash2 size={16} strokeWidth={1.75} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button type="button" variant="ghost" onClick={() => setItems(prev => [...prev, emptyItem(vatPayer ? 21 : 0)])}>
            <Plus size={16} strokeWidth={1.75} />
            Další položka
          </Button>
          <p className="font-num text-[17px] font-semibold tabular-nums text-ink">
            Celkem {money(total, currency)}
          </p>
        </div>
        {!vatPayer && <p className="text-xs text-quiet">Nejste plátce DPH, takže se na faktuře neúčtuje.</p>}
      </section>

      <section className="flex flex-col gap-4 rounded-box border border-navy-100 bg-surface p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-ink">Podrobnosti</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Vystaveno">
            <Input type="date" value={issuedOn} onChange={e => setIssuedOn(e.target.value)} required />
          </Field>
          <Field label="Splatnost">
            <Input type="date" value={dueOn} onChange={e => setDueOn(e.target.value)} required />
          </Field>
          <Field label="Datum plnění">
            <Input type="date" value={suppliedOn} onChange={e => setSuppliedOn(e.target.value)} required />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Měna">
            <select
              value={currency}
              onChange={e => setCurrency(e.target.value)}
              className="h-11 w-full rounded-chip border border-input bg-surface px-3.5 text-[15px] text-ink transition-colors focus-visible:border-navy-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
            >
              {INVOICE_CURRENCIES.map(code => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Zakázka" hint="Faktura se tím objeví v detailu zakázky.">
            <select
              value={projectId}
              onChange={e => setProjectId(e.target.value)}
              className="h-11 w-full rounded-chip border border-input bg-surface px-3.5 text-[15px] text-ink transition-colors focus-visible:border-navy-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
            >
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
        <Field label="Poznámka" hint="Napíše se dolů na fakturu.">
          <Input value={note} onChange={e => setNote(e.target.value)} />
        </Field>
      </section>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? 'Vystavuju…' : 'Vystavit fakturu'}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.push('/dashboard/faktury')}>
          Zpět na faktury
        </Button>
        <p className="text-xs text-quiet">Číslo přidělím při vystavení. Vystavenou fakturu už nejde měnit, jen stornovat.</p>
      </div>
    </form>
  )
}
