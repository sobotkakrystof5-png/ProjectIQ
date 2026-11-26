'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Plus, Search, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import { itemTotals, invoiceTotal } from '@/lib/invoice-pdf/totals'
import { getProjectBilling, issueNewInvoice, lookupCompany } from '@/app/dashboard/finance/invoice-actions'
import { saveInvoiceDraft } from '@/app/dashboard/faktury/koncepty-actions'
import type { InvoiceProjectOption } from '@/app/dashboard/finance/invoice-actions'
import type { IssueDraft } from '@/lib/admin/invoice-issue'
import type { InvoiceIssueItem } from '@/lib/admin/invoice-issue-schema'
import { INVOICE_CURRENCIES } from '@/lib/invoice-constants'
import {
  DEFAULT_DEPOSIT_PERCENT,
  INVOICE_KINDS,
  KIND_HINTS,
  KIND_LABELS,
  billingOverview,
  formatPercent,
  kindAvailability,
  kindItemDescription,
  resolveKindPlan,
  type InvoiceKind,
  type ProjectBilling,
} from '@/lib/admin/invoice-kinds'
import { cn } from '@/lib/utils'
import { BillingBar } from './billing-bar'

/**
 * Vystavení faktury (AD12). Cíl je hotovo do půl minuty: datum, splatnost
 * i odběratel jsou předvyplněné, zbývá napsat, co fakturuješ.
 *
 * Číslo faktury tu není — přiděluje ho databáze v okamžiku vystavení, aby
 * dvě faktury nikdy nedostaly totéž číslo.
 *
 * Nahoře se vždy rozhoduje, o jakou fakturu jde (R-143): za celé dílo,
 * zálohová, částečná, nebo finální. U zálohové a částečné se zadá procento
 * z ceny zakázky, finální vezme všechno, co zbývá. Pruh pod volbou ukazuje,
 * kolik je zaplaceno, kolik čeká na platbu a kolik zbývá vyfakturovat.
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

/** „30 000 Kč", „249,50 Kč" — haléře jen tehdy, když nejsou nulové. */
function money(amount: number, currency: string): string {
  const whole = Math.round(amount * 100) % 100 === 0
  return new Intl.NumberFormat('cs-CZ', { style: 'currency', currency, minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 }).format(amount)
}

/** „30" i „30,5" → číslo; prázdné nebo nesmysl → null. */
function toPercent(value: string): number | null {
  const parsed = Number(value.replace(',', '.').trim())
  return value.trim() !== '' && Number.isFinite(parsed) ? parsed : null
}

/** Z pole se čte číslo, ale píše se do něj text — prázdné pole není nula. */
function toNumber(value: string): number {
  const parsed = Number(value.replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : 0
}

/** Počet dní mezi dvěma ISO daty (splatnost konceptu se ukládá jako „za kolik dní"). */
function daysBetween(from: string, to: string): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)
  return Number.isFinite(ms) ? Math.round(ms / 86_400_000) : 14
}

export function IssueInvoiceForm({
  draft,
  projects,
  vatPayer,
  draftId = null,
  draftsEnabled = false,
  kindsEnabled = false,
  initial,
  replaces = null,
}: {
  draft: IssueDraft
  projects: InvoiceProjectOption[]
  vatPayer: boolean
  /**
   * Úprava konceptu (R-117). Formulář pak koncept jen ukládá — vystavuje
   * a posílá se ve Fakturách › Ke schválení jedním kliknutím.
   */
  draftId?: string | null
  /** Je migrace 117 v databázi — jde ukládat koncepty? */
  draftsEnabled?: boolean
  /** Je migrace 132 v databázi — jde vystavit zálohovou, částečnou a finální? */
  kindsEnabled?: boolean
  initial?: { currency: string; note: string; kind?: InvoiceKind | null; percent?: number | null }
  /**
   * Oprava vystavené faktury (R-148): po vystavení nové se tahle sama
   * stornuje, v témže příkazu v databázi.
   */
  replaces?: { id: string; number: string } | null
}) {
  const router = useRouter()
  const editingDraft = draftId !== null
  const [counterparty, setCounterparty] = useState<Party>(draft.counterparty)
  const [email, setEmail] = useState(draft.email)
  const [projectId, setProjectId] = useState<string>(draft.projectId ?? '')
  const [issuedOn, setIssuedOn] = useState(draft.issuedOn)
  const [suppliedOn, setSuppliedOn] = useState(draft.suppliedOn)
  const [dueOn, setDueOn] = useState(draft.dueOn)
  const [currency, setCurrency] = useState<string>(initial?.currency ?? 'CZK')
  const [note, setNote] = useState(initial?.note ?? '')
  // Popis i cena z historie klienta (AD15): co se mu fakturovalo naposledy.
  // Bez toho se u stálého klienta opisovalo totéž pokaždé znovu.
  const [items, setItems] = useState<ItemDraft[]>(() => {
    const vatRate = vatPayer ? 21 : 0
    if (draft.items.length > 0) {
      return draft.items.map((item) => ({
        description: item.description,
        quantity: String(item.quantity),
        unitPrice: String(item.unitPrice),
        // Koncept si sazbu pamatuje; předvyplnění z historie ji nenese.
        vatRate: 'vatRate' in item && (item.vatRate === 0 || item.vatRate === 12 || item.vatRate === 21) ? item.vatRate : vatRate,
      }))
    }
    return [{ ...emptyItem(vatRate), unitPrice: draft.amount > 0 ? String(draft.amount) : '' }]
  })
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const [aresPending, startAres] = useTransition()

  // ─── Druh faktury (R-143) ───
  const [billing, setBilling] = useState<ProjectBilling | null>(draft.billing)
  const [billingPending, startBilling] = useTransition()
  const availability = useMemo(() => kindAvailability(billing), [billing])
  const [kind, setKind] = useState<InvoiceKind | null>(() => {
    if (!kindsEnabled) return 'single'
    const wanted = initial?.kind ?? null
    return wanted && kindAvailability(draft.billing)[wanted] === null ? wanted : null
  })
  const [percentText, setPercentText] = useState(() =>
    initial?.percent != null ? String(initial.percent).replace('.', ',') : String(DEFAULT_DEPOSIT_PERCENT),
  )
  const percent = toPercent(percentText)
  const byPercent = kind !== null && kind !== 'single'
  const overview = billing ? billingOverview(billing) : null
  const plan = kind && byPercent ? resolveKindPlan(kind, percent, billing) : null
  const planAmount = plan?.ok ? plan.plan.amount ?? 0 : 0
  const planPercent = plan?.ok ? plan.plan.percent : null
  // Popis položky se u druhu s procentem skládá sám („Web — záloha 30 %"),
  // dokud ho nepřepíšete.
  const [kindDescription, setKindDescription] = useState<string | null>(() =>
    byPercent && draft.items[0]?.description ? draft.items[0].description : null,
  )
  const baseDescription = billing?.description || draft.items[0]?.description || ''
  const autoDescription = kind ? kindItemDescription(kind, baseDescription, planPercent) : ''
  const description = kindDescription ?? autoDescription

  const chooseKind = (next: InvoiceKind) => {
    setError(null)
    setKind(next)
    setKindDescription(null)
    if (next !== 'single') setCurrency('CZK')
    if (next === 'deposit' && toPercent(percentText) === null) setPercentText(String(DEFAULT_DEPOSIT_PERCENT))
  }

  const changeProject = (id: string) => {
    setProjectId(id)
    setError(null)
    if (id === '') {
      setBilling(null)
      if (kind && kind !== 'single') setKind(kindsEnabled ? null : 'single')
      return
    }
    startBilling(async () => {
      const next = await getProjectBilling(id, replaces?.id ?? null)
      setBilling(next)
      if (kindsEnabled && kind && kindAvailability(next)[kind] !== null) setKind(null)
    })
  }

  /** Položky, jak půjdou na server: u druhu s procentem jediná, s částkou z procenta. */
  const outgoingItems = (): InvoiceIssueItem[] =>
    byPercent
      ? [{ description, quantity: 1, unitPrice: planAmount, vatRate: vatPayer ? 21 : 0 }]
      : items.map(toItem)

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

  const saveDraft = () => {
    setError(null)
    if (plan && !plan.ok) {
      setError(plan.error)
      return
    }
    start(async () => {
      const result = await saveInvoiceDraft(draftId, {
        projectId: projectId === '' ? null : projectId,
        counterparty,
        email: email.trim(),
        items: outgoingItems(),
        currency,
        dueDays: Math.min(90, Math.max(0, daysBetween(issuedOn, dueOn))),
        // Plnění v den vystavení se neukládá — u konceptu je to den schválení.
        suppliedOn: suppliedOn === issuedOn ? '' : suppliedOn,
        note,
        kind,
        percent: kind === 'deposit' || kind === 'partial' ? percent : null,
      })
      if (result.error) {
        setError(result.error)
        return
      }
      toast.success(editingDraft ? 'Koncept uložený' : 'Koncept čeká ve Fakturách na schválení')
      router.push('/dashboard/faktury#ke-schvaleni')
    })
  }

  const submit = () => {
    if (!kind) {
      setError('Nahoře vyberte, o jakou fakturu jde.')
      return
    }
    if (plan && !plan.ok) {
      setError(plan.error)
      return
    }
    if (editingDraft) {
      saveDraft()
      return
    }
    setError(null)
    start(async () => {
      const result = await issueNewInvoice(
        {
          projectId: projectId === '' ? null : projectId,
          counterparty,
          issuedOn,
          suppliedOn,
          dueOn,
          currency,
          items: outgoingItems(),
          note,
          kind,
          percent: kind === 'deposit' || kind === 'partial' ? percent : null,
        },
        email.trim(),
        replaces?.id ?? null,
      )
      if (result.error || !result.id) {
        setError(result.error ?? 'Fakturu se nepodařilo vystavit.')
        return
      }
      const label = `${kind === 'single' ? 'Faktura' : `${KIND_LABELS[kind]} faktura`} ${result.number} vystavená`
      toast.success(replaces ? `${label}, ${replaces.number} je stornovaná` : label)
      router.push(`/dashboard/faktury/${result.id}`)
    })
  }

  const projectSelect = (
    <Field label="Zakázka" hint={kindsEnabled ? 'Procento se počítá z ceny zakázky. Faktura se objeví v jejím detailu.' : 'Faktura se tím objeví v detailu zakázky.'}>
      <select
        value={projectId}
        onChange={e => changeProject(e.target.value)}
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
  )

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={event => {
        event.preventDefault()
        submit()
      }}
    >
      {kindsEnabled && (
        <section className="flex flex-col gap-4 rounded-box border border-navy-100 bg-surface p-4 sm:p-5">
          {projectSelect}
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-sm font-semibold text-ink">Jaká je to faktura?</legend>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {INVOICE_KINDS.map((k) => {
                const why = availability[k]
                const isOn = kind === k
                return (
                  <label
                    key={k}
                    className={cn(
                      'relative flex min-h-[72px] flex-col gap-1 rounded-box border p-3.5 pr-10 transition-colors duration-200 ease-zq has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-navy-500 has-[:focus-visible]:ring-offset-2',
                      isOn ? 'border-navy-700 bg-navy-50' : 'border-navy-100 bg-surface',
                      why ? 'cursor-not-allowed' : 'cursor-pointer hover:border-navy-300',
                    )}
                  >
                    <input
                      type="radio"
                      name="invoice-kind"
                      value={k}
                      checked={isOn}
                      disabled={why !== null}
                      onChange={() => chooseKind(k)}
                      className="sr-only"
                    />
                    <span className={cn('text-[15px] font-semibold leading-snug', why ? 'text-quiet' : 'text-ink')}>{KIND_LABELS[k]}</span>
                    <span className="text-xs leading-snug text-quiet">{why ?? KIND_HINTS[k]}</span>
                    {isOn && <Check aria-hidden size={18} strokeWidth={1.75} className="absolute right-3 top-3.5 text-navy-700" />}
                  </label>
                )
              })}
            </div>
          </fieldset>

          {overview && overview.price > 0 && (
            <div className="flex flex-col gap-4 border-t border-navy-100 pt-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="text-sm text-ink">
                  Cena zakázky <span className="font-num font-semibold tabular-nums">{money(overview.price, 'CZK')}</span>
                </p>
                <p className="text-sm text-quiet">
                  Zbývá doplatit <span className="font-num tabular-nums text-ink">{money(overview.toPay, 'CZK')}</span>
                </p>
              </div>
              <BillingBar overview={overview} thisAmount={byPercent ? planAmount : 0} />

              {(kind === 'deposit' || kind === 'partial') && (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-end gap-3">
                    <Field label="Kolik procent z ceny">
                      <div className="flex items-center gap-2">
                        <Input
                          value={percentText}
                          inputMode="decimal"
                          className="w-24"
                          aria-label="Procento z ceny zakázky"
                          onChange={e => setPercentText(e.target.value)}
                        />
                        <span className="text-sm text-quiet">%</span>
                      </div>
                    </Field>
                    <div className="flex flex-wrap gap-2">
                      {[30, 50].filter(p => p <= overview.freePct).map(p => (
                        <Button key={p} type="button" variant="outline" onClick={() => setPercentText(String(p))}>
                          {p} %
                        </Button>
                      ))}
                      {overview.freePct > 0 && (
                        <Button type="button" variant="outline" onClick={() => setPercentText(formatPercent(overview.freePct))}>
                          Zbytek {formatPercent(overview.freePct)} %
                        </Button>
                      )}
                    </div>
                  </div>
                  {plan && !plan.ok ? (
                    <p className="text-sm text-danger">{plan.error}</p>
                  ) : (
                    <p className="text-sm text-ink">
                      Faktura na <span className="font-num font-semibold tabular-nums">{money(planAmount, 'CZK')}</span>
                    </p>
                  )}
                </div>
              )}
              {kind === 'final' && plan?.ok && (
                <p className="text-sm text-ink">
                  Finální faktura na všechno, co zbývá:{' '}
                  <span className="font-num font-semibold tabular-nums">{money(planAmount, 'CZK')}</span>
                  {planPercent !== null && <span className="text-quiet"> · {formatPercent(planPercent)} % ceny</span>}
                </p>
              )}
            </div>
          )}
          {billingPending && <p className="text-xs text-quiet">Načítám platby zakázky…</p>}
        </section>
      )}

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
          <Input value={counterparty.name} onChange={e => setCounterparty(p => ({ ...p, name: e.target.value }))} required={!editingDraft} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Adresa">
            <Input value={counterparty.address} onChange={e => setCounterparty(p => ({ ...p, address: e.target.value }))} />
          </Field>
          <Field label="DIČ" hint="Nepovinné.">
            <Input value={counterparty.dic} onChange={e => setCounterparty(p => ({ ...p, dic: e.target.value }))} />
          </Field>
        </div>
        <Field label="E-mail pro fakturu" hint="Sem fakturu pošlu. Na fakturu se netiskne.">
          <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="adresa@klient.cz" />
        </Field>
      </section>

      {byPercent ? (
        <section className="flex flex-col gap-4 rounded-box border border-navy-100 bg-surface p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-ink">Co fakturujete</h2>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <Field label="Popis" hint="Tohle bude na faktuře jako položka. Částka se počítá z procenta.">
              <Input value={description} onChange={e => setKindDescription(e.target.value)} required={!editingDraft} />
            </Field>
            <p className="pb-3 font-num text-[17px] font-semibold tabular-nums text-ink">{money(planAmount, 'CZK')}</p>
          </div>
          {!vatPayer && <p className="text-xs text-quiet">Nejste plátce DPH, takže se na faktuře neúčtuje.</p>}
        </section>
      ) : (
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
                  required={!editingDraft}
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
      )}

      <section className="flex flex-col gap-4 rounded-box border border-navy-100 bg-surface p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-ink">Podrobnosti</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Vystaveno">
            <Input type="date" value={issuedOn} onChange={e => setIssuedOn(e.target.value)} required />
          </Field>
          <Field label="Splatnost">
            <Input type="date" value={dueOn} onChange={e => setDueOn(e.target.value)} required />
          </Field>
          <Field label="Datum plnění" hint={kind === 'deposit' ? 'Na zálohové faktuře se netiskne.' : undefined}>
            <Input type="date" value={suppliedOn} onChange={e => setSuppliedOn(e.target.value)} required />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Měna" hint={byPercent ? 'Cena zakázky je v korunách.' : undefined}>
            <select
              value={currency}
              disabled={byPercent}
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
          {!kindsEnabled && projectSelect}
        </div>
        <Field label="Poznámka" hint="Napíše se dolů na fakturu.">
          <Input value={note} onChange={e => setNote(e.target.value)} />
        </Field>
      </section>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {editingDraft
            ? pending ? 'Ukládám…' : 'Uložit koncept'
            : pending ? 'Vystavuju…' : replaces ? 'Vystavit opravenou fakturu' : 'Vystavit fakturu'}
        </Button>
        {!editingDraft && !replaces && draftsEnabled && (
          <Button type="button" variant="outline" onClick={saveDraft} disabled={pending}>
            Uložit jako koncept
          </Button>
        )}
        <Button type="button" variant="ghost" onClick={() => router.push('/dashboard/faktury')}>
          Zpět na faktury
        </Button>
        <p className="text-xs text-quiet">
          {editingDraft
            ? 'Vystavíte a pošlete ji jedním kliknutím ve Fakturách › Ke schválení.'
            : replaces
              ? `Nová faktura dostane další číslo a ${replaces.number} se tím stornuje. Klientovi ji pak pošlete z detailu.`
              : 'Číslo přidělím při vystavení. Vystavenou fakturu už nejde měnit, jen stornovat nebo opravit.'}
        </p>
      </div>
    </form>
  )
}
