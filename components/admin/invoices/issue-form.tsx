'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2, Plus, Search, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/components/ui/toast'
import { issueInvoiceAction, lookupIcoAction } from '@/app/dashboard/faktury/actions'
import { invoiceSums, type InvoiceItemInput, type IssueOptions, type IssueProjectOption } from '@/lib/admin/invoice-schema'

/**
 * Vystavení faktury (AD12).
 *
 * Cesta na třicet vteřin: vyberu zakázku → položka a částka se předvyplní
 * z ní, odběratel z kontaktu a z jeho poslední faktury → Vystavit.
 * Všechno ostatní (číslo, datum, splatnost) doplní aplikace.
 */

const selectCls =
  'h-11 w-full appearance-none rounded-chip border border-input bg-surface px-3.5 text-[15px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

type Party = IssueProjectOption['counterparty']

const emptyParty: Party = { name: '', address: '', ico: '', dic: '', email: '' }

function addDays(day: string, count: number): string {
  const date = new Date(day + 'T00:00:00Z')
  date.setUTCDate(date.getUTCDate() + count)
  return date.toISOString().slice(0, 10)
}

function money(amount: number, currency: string): string {
  return new Intl.NumberFormat('cs-CZ', { style: 'currency', currency }).format(amount)
}

export function IssueInvoiceForm({
  options, today, presetProjectId,
}: {
  options: IssueOptions
  today: string
  presetProjectId: string | null
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [loadingAres, setLoadingAres] = useState(false)

  const preset = options.projects.find((project) => project.id === presetProjectId) ?? null
  const [projectId, setProjectId] = useState<string | null>(preset?.id ?? null)
  const [contactId, setContactId] = useState<string | null>(preset?.contactId ?? null)
  const [party, setParty] = useState<Party>(preset ? preset.counterparty : emptyParty)
  const [currency, setCurrency] = useState<'CZK' | 'EUR'>('CZK')
  const [items, setItems] = useState<InvoiceItemInput[]>([
    {
      description: preset?.description ?? '',
      quantity: 1,
      unitPrice: preset?.remaining ?? 0,
      vatRate: 0,
    },
  ])
  const [issuedOn, setIssuedOn] = useState(today)
  const [dueOn, setDueOn] = useState(addDays(today, 14))
  const [suppliedOn, setSuppliedOn] = useState(today)
  const [note, setNote] = useState('')

  const vatPayer = options.profile.vatPayer
  const ready = options.profile.name !== '' && options.profile.address !== '' && options.profile.ico.length === 8

  const total = useMemo(() => {
    try {
      return invoiceSums(items)
    } catch {
      return null
    }
  }, [items])

  const setItem = (index: number, patch: Partial<InvoiceItemInput>) =>
    setItems((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)))

  function selectProject(id: string) {
    const project = options.projects.find((item) => item.id === id) ?? null
    setProjectId(project?.id ?? null)
    setContactId(project?.contactId ?? null)
    if (!project) return
    setParty(project.counterparty)
    setItems([{ description: project.description ?? project.clientName, quantity: 1, unitPrice: project.remaining ?? 0, vatRate: 0 }])
  }

  function fromRegistry() {
    setLoadingAres(true)
    start(async () => {
      const result = await lookupIcoAction(party.ico)
      setLoadingAres(false)
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      setParty((current) => ({
        ...current,
        name: result.subject.name || current.name,
        address: result.subject.address || current.address,
        dic: result.subject.dic || current.dic,
      }))
      toast.success('Odběratel je doplněný z rejstříku.')
    })
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!ready) return
    start(async () => {
      const result = await issueInvoiceAction({
        projectId, contactId, counterparty: party,
        issuedOn, suppliedOn: vatPayer ? suppliedOn : issuedOn, dueOn,
        currency, items, note,
      })
      if (result.error || !result.id) {
        toast.error(result.error ?? 'Fakturu se nepodařilo vystavit.')
        return
      }
      toast.success(`Faktura ${result.number} je vystavená.`, { description: 'PDF stáhnete na detailu faktury.' })
      router.push(`/dashboard/faktury/${result.id}`)
    })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {!ready && (
        <p className="rounded-box border border-signal-line bg-signal-bg px-4 py-3 text-sm text-signal-ink">
          Nejdřív doplňte svoje fakturační údaje — bez nich doklad nemá dodavatele.{' '}
          <Link href="/dashboard/faktury/nastaveni" className="font-semibold underline">Doplnit údaje</Link>
        </p>
      )}

      <section className="flex flex-col gap-4 rounded-box border border-navy-100 bg-surface p-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="zakazka">Zakázka</Label>
          <select
            id="zakazka" className={selectCls} value={projectId ?? ''}
            onChange={(event) => selectProject(event.target.value)}
          >
            <option value="">Bez zakázky</option>
            {options.projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.clientName}
                {project.description ? ` — ${project.description}` : ''}
              </option>
            ))}
          </select>
          <p className="text-xs text-quiet">Z vybrané zakázky se předvyplní odběratel i částka. Fakturu jde vystavit i bez ní.</p>
        </div>

        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="pb-2 text-sm font-semibold text-ink">Odběratel</legend>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="klient-ico">IČO</Label>
            <div className="flex gap-2">
              <Input
                id="klient-ico" value={party.ico} inputMode="numeric" maxLength={8}
                onChange={(event) => setParty({ ...party, ico: event.target.value.replace(/\D/g, '') })}
              />
              <Button type="button" variant="outline" onClick={fromRegistry} disabled={pending || party.ico.length !== 8}>
                {loadingAres ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Search size={15} strokeWidth={1.75} aria-hidden />}
                Z rejstříku
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="klient-jmeno">Jméno nebo firma</Label>
            <Input
              id="klient-jmeno" value={party.name} maxLength={160} required
              onChange={(event) => setParty({ ...party, name: event.target.value })}
            />
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="klient-adresa">Adresa</Label>
            <Input
              id="klient-adresa" value={party.address} maxLength={400}
              onChange={(event) => setParty({ ...party, address: event.target.value })}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="klient-dic">DIČ</Label>
            <Input
              id="klient-dic" value={party.dic} maxLength={20}
              onChange={(event) => setParty({ ...party, dic: event.target.value })}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="klient-email">E-mail</Label>
            <Input
              id="klient-email" type="email" value={party.email} maxLength={254}
              onChange={(event) => setParty({ ...party, email: event.target.value })}
            />
          </div>
        </fieldset>
      </section>

      <section className="flex flex-col gap-3 rounded-box border border-navy-100 bg-surface p-5">
        <h2 className="text-sm font-semibold text-ink">Položky</h2>

        {items.map((item, index) => (
          <div key={index} className="grid gap-3 border-b border-navy-100 pb-3 last:border-0 last:pb-0 sm:grid-cols-[1fr_6rem_8rem_auto] sm:items-end">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`popis-${index}`}>Co fakturujete</Label>
              <Input
                id={`popis-${index}`} value={item.description} maxLength={200} required
                onChange={(event) => setItem(index, { description: event.target.value })}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`pocet-${index}`}>Počet</Label>
              <Input
                id={`pocet-${index}`} type="number" min="0.001" step="0.001" value={item.quantity} required
                onChange={(event) => setItem(index, { quantity: Number(event.target.value) })}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`cena-${index}`}>Cena {vatPayer ? 'bez DPH' : ''}</Label>
              <Input
                id={`cena-${index}`} type="number" min="0" step="0.01" value={item.unitPrice} required
                onChange={(event) => setItem(index, { unitPrice: Number(event.target.value) })}
              />
            </div>

            <div className="flex items-end gap-2">
              {vatPayer && (
                <select
                  aria-label="Sazba DPH" className={`${selectCls} w-24`} value={item.vatRate}
                  onChange={(event) => setItem(index, { vatRate: Number(event.target.value) as InvoiceItemInput['vatRate'] })}
                >
                  <option value={21}>21 %</option>
                  <option value={12}>12 %</option>
                  <option value={0}>0 %</option>
                </select>
              )}
              {items.length > 1 && (
                <Button
                  type="button" variant="ghost" size="icon" aria-label={`Odebrat položku ${index + 1}`}
                  onClick={() => setItems((current) => current.filter((_, i) => i !== index))}
                >
                  <Trash2 size={15} strokeWidth={1.75} aria-hidden />
                </Button>
              )}
            </div>
          </div>
        ))}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button
            type="button" variant="outline" disabled={items.length >= 50}
            onClick={() => setItems((current) => [...current, { description: '', quantity: 1, unitPrice: 0, vatRate: vatPayer ? 21 : 0 }])}
          >
            <Plus size={15} strokeWidth={1.75} aria-hidden />
            Přidat položku
          </Button>

          <p className="font-num text-[17px] font-semibold tabular-nums text-ink">
            Celkem {total ? money(total.amount, currency) : '—'}
            {vatPayer && total && total.vat > 0 && (
              <span className="ml-2 text-sm font-normal text-quiet">z toho DPH {money(total.vat, currency)}</span>
            )}
          </p>
        </div>
      </section>

      <section className="grid gap-4 rounded-box border border-navy-100 bg-surface p-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="vystaveno">Vystaveno</Label>
          <Input id="vystaveno" type="date" value={issuedOn} required onChange={(event) => setIssuedOn(event.target.value)} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="splatnost">Splatnost</Label>
          <Input id="splatnost" type="date" value={dueOn} required min={issuedOn} onChange={(event) => setDueOn(event.target.value)} />
          <div className="flex gap-2">
            {[7, 14, 30].map((days) => (
              <button
                key={days} type="button"
                className="min-h-11 rounded-full px-3 text-sm text-quiet transition-colors hover:text-ink"
                onClick={() => setDueOn(addDays(issuedOn, days))}
              >
                za {days} dní
              </button>
            ))}
          </div>
        </div>

        {vatPayer && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="duzp">Datum uskutečnění plnění</Label>
            <Input id="duzp" type="date" value={suppliedOn} required onChange={(event) => setSuppliedOn(event.target.value)} />
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="mena">Měna</Label>
          <select
            id="mena" className={selectCls} value={currency}
            onChange={(event) => setCurrency(event.target.value === 'EUR' ? 'EUR' : 'CZK')}
          >
            <option value="CZK">Koruny</option>
            <option value="EUR">Eura</option>
          </select>
          {currency === 'EUR' && <p className="text-xs text-quiet">QR kód k zaplacení umíme jen u korun.</p>}
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="poznamka">Poznámka na faktuře</Label>
          <textarea
            id="poznamka" value={note} maxLength={2000} rows={3}
            onChange={(event) => setNote(event.target.value)}
            className="w-full rounded-chip border border-input bg-surface px-3.5 py-2.5 text-[15px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-end gap-3">
        <Link href="/dashboard/faktury" className="min-h-11 px-3 py-3 text-sm text-quiet transition-colors hover:text-ink">
          Zrušit
        </Link>
        <Button type="submit" disabled={pending || !ready || total === null}>
          {pending && <Loader2 size={15} className="animate-spin" aria-hidden />}
          Vystavit fakturu
        </Button>
      </div>
    </form>
  )
}
