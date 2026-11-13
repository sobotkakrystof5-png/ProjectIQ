'use client'

import { useState, useTransition, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createProject, updateProject } from '@/app/actions'
import { STATUS_LABELS, STATUS_ORDER, type InvoiceAiExtract, type Project, type ProjectStatus, type ProjectType } from '@/lib/types'
import { cn } from '@/lib/utils'
import { getPragueTodayISO } from '@/lib/prague-time'
import { ChevronDown, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SECTION_LABEL } from '@/components/admin/card'
import {
  InvoiceFields, emptyInvoiceForm, validateInvoiceForm, invoiceFormToFormData,
  type InvoiceFormState,
} from '@/components/InvoiceFields'
import type { ProjectPrefill } from '@/lib/admin/memory/types'

type FormData = {
  client_name: string
  client_email: string
  client_phone: string
  service_type: string
  description: string
  project_url: string
  focus: string
  status: ProjectStatus
  progress: number
  price: string
  paid: boolean
  /** Kdy peníze dorazily — prázdné znamená dnes (AD13). */
  paid_on: string
  estimated_costs: string
  deposit_amount: string
  deposit_paid: boolean
  deposit_paid_on: string
  invoiced_on_ico: boolean
  deadline: string
  notes: string
  progressNote: string
  addToCompleted: boolean
  completedType: ProjectType
  completedAt: string
  completedDifficulty: number
  completedTimeInvested: string
}

interface ProjectFormProps {
  project?: Project
  /**
   * Předvyplnění u známého klienta (AD15). Jen spočítané z historie —
   * věta od modelu se do formuláře nikdy nedostane (R-085).
   */
  prefill?: ProjectPrefill
}

const defaultData: FormData = {
  client_name: '',
  client_email: '',
  client_phone: '',
  service_type: '',
  description: '',
  project_url: '',
  focus: '',
  status: 'new',
  progress: 0,
  price: '',
  paid: false,
  paid_on: '',
  estimated_costs: '',
  deposit_amount: '',
  deposit_paid: false,
  deposit_paid_on: '',
  invoiced_on_ico: false,
  deadline: '',
  notes: '',
  progressNote: '',
  addToCompleted: false,
  completedType: 'client',
  completedAt: getPragueTodayISO(),
  completedDifficulty: 5,
  completedTimeInvested: '',
}

function projectToForm(p: Project): FormData {
  return {
    client_name: p.client_name,
    client_email: p.client_email ?? '',
    client_phone: p.client_phone ?? '',
    service_type: p.service_type ?? '',
    description: p.description ?? '',
    project_url: p.project_url ?? '',
    focus: p.focus ?? '',
    status: p.status,
    progress: p.progress,
    price: p.price !== null ? String(p.price) : '',
    paid: p.paid,
    paid_on: p.paid_on ?? '',
    estimated_costs: p.estimated_costs !== null ? String(p.estimated_costs) : '',
    deposit_amount: p.deposit_amount !== null ? String(p.deposit_amount) : '',
    deposit_paid: p.deposit_paid,
    deposit_paid_on: p.deposit_paid_on ?? '',
    invoiced_on_ico: p.invoiced_on_ico ?? false,
    deadline: p.deadline ?? '',
    notes: p.notes ?? '',
    progressNote: '',
    addToCompleted: false,
    completedType: 'client',
    completedAt: getPragueTodayISO(),
    completedDifficulty: 5,
    completedTimeInvested: '',
  }
}

/** Prázdná pole nové zakázky vyplní historie klienta; všechno jde přepsat. */
function prefillToForm(prefill: ProjectPrefill): FormData {
  return {
    ...defaultData,
    client_name: prefill.clientName,
    client_email: prefill.clientEmail,
    client_phone: prefill.clientPhone,
    service_type: prefill.serviceType,
    price: prefill.price,
  }
}

export function ProjectForm({ project, prefill }: ProjectFormProps) {
  const [form, setForm] = useState<FormData>(
    project ? projectToForm(project) : prefill ? prefillToForm(prefill) : defaultData,
  )
  const [depositManuallySet, setDepositManuallySet] = useState(
    project ? project.deposit_amount !== null : false
  )
  const [error, setError] = useState<string | null>(null)
  // Faktura přiložená rovnou k nové zakázce. Vlastní state, ne součást
  // `FormData` — jde do jiné tabulky a odesílá se jako FormData kvůli PDF.
  const [attachInvoice, setAttachInvoice] = useState(false)
  const [invoiceForm, setInvoiceForm] = useState<InvoiceFormState>(() => emptyInvoiceForm())
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null)
  const [invoiceAi, setInvoiceAi] = useState<InvoiceAiExtract | null>(null)
  const [isPending, startTransition] = useTransition()
  // isPending only reflects the transition's synchronous portion for async
  // callbacks in React 18 — it can flip back to false before the server
  // action resolves, so a fast double-click could still slip through and
  // create two projects. This ref guards the async work itself.
  const isSubmittingRef = useRef(false)
  const router = useRouter()
  const originalProgress = project?.progress ?? 0
  const progressChanged = project != null && form.progress !== originalProgress

  const depositAmount = useMemo(() => {
    if (depositManuallySet) return form.deposit_amount
    const price = Number(form.price)
    return form.price !== '' && price > 0 ? String(Math.round(price * 0.3)) : ''
  }, [depositManuallySet, form.deposit_amount, form.price])

  function set<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function handleDepositChange(value: string) {
    setDepositManuallySet(true)
    setForm(prev => ({ ...prev, deposit_amount: value }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (isSubmittingRef.current) return
    setError(null)

    if (!form.client_name.trim()) {
      setError('Zadej název klienta')
      return
    }

    if (progressChanged && !form.progressNote.trim()) {
      setError('Posunutí postupu vyžaduje popis — co jsi udělal?')
      return
    }

    const payload = {
      client_name: form.client_name.trim(),
      client_email: form.client_email.trim() || null,
      client_phone: form.client_phone.trim() || null,
      service_type: form.service_type.trim() || null,
      description: form.description.trim() || null,
      project_url: form.project_url.trim() || null,
      focus: form.focus.trim() || null,
      status: form.status,
      progress: form.progress,
      price: form.price !== '' ? Number(form.price) : null,
      paid: form.paid,
      paid_on: form.paid ? form.paid_on || null : null,
      estimated_costs: form.estimated_costs !== '' ? Number(form.estimated_costs) : null,
      deposit_amount: depositAmount !== '' ? Number(depositAmount) : null,
      deposit_paid: form.deposit_paid,
      deposit_paid_on: form.deposit_paid ? form.deposit_paid_on || null : null,
      invoiced_on_ico: form.invoiced_on_ico,
      deadline: form.deadline || null,
      notes: form.notes.trim() || null,
    }

    const wantsInvoice = !project && attachInvoice
    if (wantsInvoice) {
      const invoiceError = validateInvoiceForm(invoiceForm, invoiceFile)
      if (invoiceError) {
        setError(invoiceError)
        return
      }
    }

    const closeExtra = !project && form.addToCompleted ? {
      project_type: form.completedType,
      closed_on: form.completedAt,
      difficulty: form.completedDifficulty,
      time_invested: form.completedTimeInvested ? Number(form.completedTimeInvested) : null,
    } : undefined

    isSubmittingRef.current = true
    startTransition(async () => {
      try {
        if (project) {
          await updateProject(
            project.id,
            payload,
            progressChanged
              ? { from: originalProgress, description: form.progressNote.trim() }
              : undefined
          )
          router.refresh()
        } else {
          const result = await createProject(
            payload,
            closeExtra,
            wantsInvoice
              ? invoiceFormToFormData(
                  // Odběratel se bere z klienta zakázky, když ho uživatel nepřepsal.
                  { ...invoiceForm, client_name: invoiceForm.client_name || payload.client_name },
                  invoiceFile,
                  false,
                  invoiceAi
                )
              : undefined
          )
          if (result?.error) {
            setError(result.error)
            return
          }
        }
      } catch {
        setError('Chyba při ukládání zakázky')
      } finally {
        isSubmittingRef.current = false
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <p className="rounded-chip border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</p>
      )}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Klient *" className="sm:col-span-2">
          <input
            type="text"
            value={form.client_name}
            onChange={e => set('client_name', e.target.value)}
            placeholder="Jméno klienta nebo firma"
            className={inputCls}
            required
          />
        </Field>

        <Field label="E-mail klienta (pro automatické potvrzení)" className="sm:col-span-2">
          <input
            type="email"
            value={form.client_email}
            onChange={e => set('client_email', e.target.value)}
            placeholder="klient@email.cz"
            className={inputCls}
          />
        </Field>

        <Field label="Telefonní číslo">
          <input
            type="tel"
            value={form.client_phone}
            onChange={e => set('client_phone', e.target.value)}
            placeholder="+420 601 234 567"
            className={inputCls}
          />
        </Field>

        <Field label="Typ služby">
          <input
            type="text"
            value={form.service_type}
            onChange={e => set('service_type', e.target.value)}
            placeholder="např. Web na míru, E-shop, Logo…"
            className={inputCls}
          />
        </Field>

        <Field label="Popis zakázky" className="sm:col-span-2">
          <input
            type="text"
            value={form.description}
            onChange={e => set('description', e.target.value)}
            placeholder="Krátký popis co děláme"
            className={inputCls}
          />
        </Field>

        <Field label="URL projektu (živá verze na Vercel)" className="sm:col-span-2">
          <input
            type="url"
            value={form.project_url}
            onChange={e => set('project_url', e.target.value)}
            placeholder="https://muj-projekt.vercel.app"
            className={inputCls}
          />
        </Field>

        <Field label="Zaměření" className="sm:col-span-2">
          <textarea
            value={form.focus}
            onChange={e => set('focus', e.target.value)}
            placeholder="Co je cílem zakázky..."
            rows={3}
            className={cn(inputCls, 'resize-none')}
          />
        </Field>

        <Field label="Stav">
          <select
            value={form.status}
            onChange={e => set('status', e.target.value as ProjectStatus)}
            className={inputCls}
          >
            {STATUS_ORDER.map(s => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
        </Field>

        <Field label={`Postup — ${form.progress}%`} className={progressChanged ? 'sm:col-span-2' : undefined}>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={form.progress}
              onChange={e => {
                set('progress', Number(e.target.value))
                if (Number(e.target.value) === originalProgress) set('progressNote', '')
              }}
              className="flex-1 accent-navy-800"
            />
          </div>
          {progressChanged && (
            <div className="mt-3">
              <label className="mb-1.5 block text-sm font-medium text-signal-ink">
                Co jsi udělal? ({originalProgress}% → {form.progress}%) *
              </label>
              <textarea
                value={form.progressNote}
                onChange={e => set('progressNote', e.target.value)}
                placeholder="Popiš co jsi udělal, v jaké fázi projekt je..."
                rows={3}
                className={cn(inputCls, 'resize-none border-signal-line')}
              />
            </div>
          )}
        </Field>

        <Field label="Cena (Kč)">
          <input
            type="number"
            value={form.price}
            onChange={e => set('price', e.target.value)}
            placeholder="0"
            min={0}
            className={inputCls}
          />
        </Field>

        <Field label="Předpokládané náklady (Kč)">
          <input
            type="number"
            value={form.estimated_costs}
            onChange={e => set('estimated_costs', e.target.value)}
            placeholder="0"
            min={0}
            className={inputCls}
          />
        </Field>

        <Field label="Termín">
          <input
            type="date"
            value={form.deadline}
            onChange={e => set('deadline', e.target.value)}
            className={inputCls}
          />
        </Field>

        <Field label="Poznámky (interní)" className="sm:col-span-2">
          <textarea
            value={form.notes}
            onChange={e => set('notes', e.target.value)}
            placeholder="Interní poznámky — klient neuvidí..."
            rows={3}
            className={cn(inputCls, 'resize-none')}
          />
        </Field>

        <div className="sm:col-span-2 space-y-3">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="paid"
              checked={form.paid}
              onChange={e => set('paid', e.target.checked)}
              className="w-4 h-4 accent-navy-800"
            />
            <label htmlFor="paid" className="text-sm text-foreground cursor-pointer">
              Zakázka zaplacena
            </label>
          </div>

          {/* Datum platby, ne datum zápisu: příjem z prosince zapsaný v lednu
              by jinak spadl do jiného daňového roku (AD13). */}
          {form.paid && (
            <div className="flex flex-wrap items-center gap-3">
              <label htmlFor="paid_on" className="text-sm text-quiet">
                Peníze dorazily
              </label>
              <input
                type="date"
                id="paid_on"
                value={form.paid_on}
                onChange={e => set('paid_on', e.target.value)}
                className={cn(inputCls, 'w-auto min-h-11')}
              />
              <span className="text-xs text-quiet">prázdné = dnes</span>
            </div>
          )}

          {/* Řídí, do které linie příjmů zakázka spadne — přiznané jdou do
              daňového přiznání a do daňové kalkulačky ve Financích. */}
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              id="invoiced_on_ico"
              checked={form.invoiced_on_ico}
              onChange={e => set('invoiced_on_ico', e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-navy-700"
            />
            <div>
              <label htmlFor="invoiced_on_ico" className="text-sm text-foreground cursor-pointer">
                Fakturováno na IČO
              </label>
              <p className="mt-0.5 text-xs text-quiet">
                Příjmy z této zakázky spadnou do přiznané linie a do daňové kalkulačky.
                {project && ' Změna přerovná i příjmy, které už ze zakázky vznikly.'}
              </p>
            </div>
          </div>

          {/* Záloha */}
          <div className="space-y-3 rounded-chip border border-navy-100 bg-navy-50/60 p-4">
            <h3 className={SECTION_LABEL}>
              Záloha{(() => {
                const price = Number(form.price)
                const deposit = Number(depositAmount)
                if (form.price && price > 0 && depositAmount && deposit > 0) {
                  const pct = Math.round((deposit / price) * 100)
                  return ` — ${pct} % z ceny`
                }
                return ' — 30 % z ceny (auto)'
              })()}
            </h3>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={depositAmount}
                onChange={e => handleDepositChange(e.target.value)}
                placeholder={
                  form.price !== '' && Number(form.price) > 0
                    ? String(Math.round(Number(form.price) * 0.3))
                    : '0'
                }
                min={0}
                className={inputCls}
              />
              <span className="shrink-0 text-sm font-medium text-quiet">Kč</span>
            </div>
            {!depositManuallySet && form.price !== '' && Number(form.price) > 0 && (
              <p className="text-xs text-quiet">Automaticky 30 % — změnou pole přepíšeš</p>
            )}
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="deposit_paid"
                checked={form.deposit_paid}
                onChange={e => set('deposit_paid', e.target.checked)}
                className="h-4 w-4 accent-navy-700"
              />
              <label htmlFor="deposit_paid" className="cursor-pointer text-sm text-ink">
                Záloha zaplacena
              </label>
            </div>
            {form.deposit_paid && (
              <div className="flex flex-wrap items-center gap-3">
                <label htmlFor="deposit_paid_on" className="text-sm text-ink">
                  Záloha dorazila
                </label>
                <input
                  type="date"
                  id="deposit_paid_on"
                  value={form.deposit_paid_on}
                  onChange={e => set('deposit_paid_on', e.target.value)}
                  className={cn(inputCls, 'w-auto min-h-11')}
                />
                <span className="text-xs text-quiet">prázdné = dnes</span>
              </div>
            )}
          </div>
        </div>

        {/* Po sloučení byznysů (AD02) platí pro každou zakázku. */}
        {!project && (
          <div className="sm:col-span-2">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="addToCompleted"
                checked={form.addToCompleted}
                onChange={e => set('addToCompleted', e.target.checked)}
                className="h-4 w-4 accent-navy-700"
              />
              <label htmlFor="addToCompleted" className="text-sm text-foreground cursor-pointer">
                Zakázka je už hotová — rovnou ji uzavřít
              </label>
            </div>

            {form.addToCompleted && (
              <div className="mt-4 space-y-4 rounded-chip border border-navy-100 bg-navy-50/60 p-4">
                <h3 className={SECTION_LABEL}>Uzavření zakázky</h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Druh zakázky">
                    <div className="relative">
                      <select
                        value={form.completedType}
                        onChange={e => set('completedType', e.target.value as ProjectType)}
                        className={cn(inputCls, 'appearance-none pr-8')}
                      >
                        <option value="client">Zakázka pro klienta</option>
                        <option value="personal">Vlastní projekt bez klienta</option>
                      </select>
                      <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-quiet" />
                    </div>
                  </Field>

                  <Field label="Datum uzavření">
                    <input
                      type="date"
                      value={form.completedAt}
                      onChange={e => set('completedAt', e.target.value)}
                      className={inputCls}
                    />
                  </Field>

                  <Field label="Náročnost (1–10)">
                    <div className="relative">
                      <select
                        value={form.completedDifficulty}
                        onChange={e => set('completedDifficulty', Number(e.target.value))}
                        className={cn(inputCls, 'appearance-none pr-8')}
                      >
                        {[1,2,3,4,5,6,7,8,9,10].map(n => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                      <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-quiet" />
                    </div>
                  </Field>

                  <Field label="Čas strávený (hod., volitelné)">
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={form.completedTimeInvested}
                      onChange={e => set('completedTimeInvested', e.target.value)}
                      placeholder="např. 12"
                      className={inputCls}
                    />
                  </Field>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Faktura k nové zakázce — po sloučení byznysů (AD02) u každé. */}
        {!project && (
          <div className="sm:col-span-2">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="attachInvoice"
                checked={attachInvoice}
                onChange={e => setAttachInvoice(e.target.checked)}
                className="h-4 w-4 accent-navy-700"
              />
              <label htmlFor="attachInvoice" className="text-sm text-foreground cursor-pointer">
                Přiložit fakturu
              </label>
            </div>

            {attachInvoice && (
              <div className="mt-4 space-y-3 rounded-chip border border-navy-100 bg-navy-50/60 p-4">
                <h3 className={SECTION_LABEL}>Faktura k zakázce</h3>
                <InvoiceFields
                  value={invoiceForm}
                  onChange={setInvoiceForm}
                  file={invoiceFile}
                  onFileChange={f => {
                    setInvoiceFile(f)
                    // Přepis patří ke konkrétnímu PDF — po výměně souboru zahodit.
                    setInvoiceAi(null)
                  }}
                  onAiExtracted={setInvoiceAi}
                  disabled={isPending}
                  autoParse
                />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 size={16} strokeWidth={1.5} className="animate-spin" aria-hidden="true" />}
          {project ? 'Uložit změny' : 'Přidat zakázku'}
        </Button>
        <Button variant="ghost" onClick={() => router.back()} className="text-quiet">
          Zrušit
        </Button>
      </div>
    </form>
  )
}

// Pole Dílků (DESIGN.md → Inputs): bílá plocha, rádius 12 px, navy okraj při zaostření.
const inputCls =
  'w-full rounded-chip border border-input bg-surface px-3.5 py-2.5 text-[15px] text-ink transition-colors placeholder:text-quiet focus-visible:border-navy-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30'

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label className="text-sm font-medium text-ink">{label}</label>
      {children}
    </div>
  )
}
