'use client'

import { useRef, useState } from 'react'
import { AlertCircle, FileText, Loader2, Paperclip, Sparkles, X } from 'lucide-react'
import { MAX_PDF_BYTES, MAX_PDF_LABEL, INVOICE_CURRENCIES } from '@/lib/invoice-constants'
import type { InvoiceAiExtract } from '@/lib/types'
import type { InvoiceProjectOption } from '@/app/hub/finance/invoice-actions'

/**
 * Pole faktury sdílená formulářem ve Financích i blokem „Přiložit fakturu"
 * v nové zakázce. Komponenta je čistě prezentační — stav i odeslání drží
 * volající.
 */

export interface InvoiceFormState {
  invoice_number: string
  project_id: string
  client_name: string
  client_ico: string
  client_dic: string
  issued_on: string
  due_on: string
  paid_on: string
  amount: string
  currency: string
  note: string
}

export function emptyInvoiceForm(overrides: Partial<InvoiceFormState> = {}): InvoiceFormState {
  return {
    invoice_number: '',
    project_id: '',
    client_name: '',
    client_ico: '',
    client_dic: '',
    issued_on: new Date().toISOString().slice(0, 10),
    due_on: '',
    paid_on: '',
    amount: '',
    currency: 'CZK',
    note: '',
    ...overrides,
  }
}

/** Rychlá kontrola na klientovi. Server si validuje znovu — tohle je jen UX. */
export function validateInvoiceForm(state: InvoiceFormState, file: File | null): string | null {
  if (!state.invoice_number.trim()) return 'Vyplň číslo faktury'
  if (!state.issued_on) return 'Vyplň datum vystavení'
  const amount = Number(state.amount)
  if (!state.amount || !Number.isFinite(amount) || amount < 0) return 'Vyplň částku'
  if (file && file.size > MAX_PDF_BYTES) return `PDF je příliš velké — maximum je ${MAX_PDF_LABEL}`
  return null
}

/**
 * Přenese výsledek AI přepisu do formuláře. Přepisuje jen to, co model
 * skutečně našel — zbytek zůstane, jak ho uživatel napsal.
 *
 * `paid_on`, `project_id` a poznámka se nikdy nepřepisují: o zaplacení a
 * zařazení rozhoduje uživatel, ne doklad.
 */
export function applyInvoiceExtract(
  state: InvoiceFormState,
  extract: InvoiceAiExtract
): InvoiceFormState {
  const keep = (next: string | null | undefined, current: string) => next?.trim() || current

  return {
    ...state,
    invoice_number: keep(extract.invoice_number, state.invoice_number),
    issued_on: keep(extract.issued_on, state.issued_on),
    due_on: keep(extract.due_on, state.due_on),
    amount:
      typeof extract.amount === 'number' && Number.isFinite(extract.amount)
        ? String(extract.amount)
        : state.amount,
    currency: keep(extract.currency, state.currency),
    client_name: keep(extract.client_name, state.client_name),
    client_ico: keep(extract.client_ico, state.client_ico),
    client_dic: keep(extract.client_dic, state.client_dic),
  }
}

export function invoiceFormToFormData(
  state: InvoiceFormState,
  file: File | null,
  removePdf = false,
  /** Surový výstup AI přepisu — uloží se k faktuře kvůli dohledatelnosti */
  aiExtracted: InvoiceAiExtract | null = null
): FormData {
  const fd = new FormData()
  fd.set('invoice_number', state.invoice_number)
  fd.set('project_id', state.project_id)
  fd.set('client_name', state.client_name)
  fd.set('client_ico', state.client_ico)
  fd.set('client_dic', state.client_dic)
  fd.set('issued_on', state.issued_on)
  fd.set('due_on', state.due_on)
  fd.set('paid_on', state.paid_on)
  fd.set('amount', state.amount)
  fd.set('currency', state.currency)
  fd.set('note', state.note)
  if (file) fd.set('pdf', file)
  if (removePdf) fd.set('remove_pdf', '1')
  if (aiExtracted) fd.set('ai_extracted', JSON.stringify(aiExtracted))
  return fd
}

const inputClass =
  'w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500'
const labelClass = 'text-xs font-medium text-muted-foreground block mb-1'

export function InvoiceFields({
  value,
  onChange,
  file,
  onFileChange,
  existingPdfName,
  onRemoveExistingPdf,
  projects,
  disabled,
  onAiExtracted,
}: {
  value: InvoiceFormState
  onChange: (next: InvoiceFormState) => void
  file: File | null
  onFileChange: (file: File | null) => void
  /** Název už uloženého PDF — zobrazí se s možností ho odebrat */
  existingPdfName?: string | null
  onRemoveExistingPdf?: () => void
  /** Když chybí, výběr zakázky se nezobrazí (faktura patří ke známé zakázce) */
  projects?: InvoiceProjectOption[]
  disabled?: boolean
  /** Dostane surový výstup AI přepisu, aby se dal uložit k faktuře */
  onAiExtracted?: (extract: InvoiceAiExtract) => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isParsing, setIsParsing] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const set = <K extends keyof InvoiceFormState>(key: K, v: InvoiceFormState[K]) =>
    onChange({ ...value, [key]: v })

  /**
   * Nechá AI přečíst vybrané PDF a předvyplnit pole. Selhání jen zobrazí
   * hlášku — formulář zůstane vyplnitelný ručně, na tom přepis nic nemění.
   */
  async function runAiParse() {
    if (!file || isParsing) return
    setIsParsing(true)
    setParseError(null)
    try {
      const fd = new FormData()
      fd.set('pdf', file)
      const res = await fetch('/api/invoices/parse', { method: 'POST', body: fd })
      const json = (await res.json()) as {
        success: boolean
        data?: InvoiceAiExtract
        error?: string
      }
      if (!json.success || !json.data) {
        setParseError(json.error ?? 'Přepis se nepodařil — vyplň fakturu ručně')
        return
      }
      onChange(applyInvoiceExtract(value, json.data))
      onAiExtracted?.(json.data)
    } catch {
      setParseError('Přepis se nepodařil — vyplň fakturu ručně')
    } finally {
      setIsParsing(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Číslo faktury *</label>
          <input
            type="text"
            value={value.invoice_number}
            onChange={e => set('invoice_number', e.target.value)}
            placeholder="2026001"
            disabled={disabled}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Částka *</label>
          <div className="flex gap-2">
            <input
              type="number"
              min="0"
              step="0.01"
              value={value.amount}
              onChange={e => set('amount', e.target.value)}
              placeholder="0"
              disabled={disabled}
              className={inputClass}
            />
            <select
              value={value.currency}
              onChange={e => set('currency', e.target.value)}
              disabled={disabled}
              className="text-sm border border-border rounded-lg px-2 py-2 bg-white shrink-0"
            >
              {INVOICE_CURRENCIES.map(c => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {projects && (
        <div>
          <label className={labelClass}>Zakázka</label>
          <select
            value={value.project_id}
            onChange={e => set('project_id', e.target.value)}
            disabled={disabled}
            className={inputClass}
          >
            <option value="">— faktura bez zakázky —</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>
                {p.client_name}
                {p.description ? ` — ${p.description}` : ''}
                {p.business === 'alteno' ? ' (ALTENO)' : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className={labelClass}>Vystaveno *</label>
          <input
            type="date"
            value={value.issued_on}
            onChange={e => set('issued_on', e.target.value)}
            disabled={disabled}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Splatnost</label>
          <input
            type="date"
            value={value.due_on}
            onChange={e => set('due_on', e.target.value)}
            disabled={disabled}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Zaplaceno</label>
          <input
            type="date"
            value={value.paid_on}
            onChange={e => set('paid_on', e.target.value)}
            disabled={disabled}
            className={inputClass}
          />
        </div>
      </div>

      {/* Datum zaplacení je jediné pole, které hýbe daněmi — ať je to vidět. */}
      <p className="text-xs text-muted-foreground -mt-1">
        {value.paid_on
          ? 'Zaplacená faktura zakládá příjem v přiznané linii k datu zaplacení.'
          : 'Bez data zaplacení je faktura pohledávka a do daňového základu nevstupuje.'}
      </p>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className={labelClass}>Odběratel</label>
          <input
            type="text"
            value={value.client_name}
            onChange={e => set('client_name', e.target.value)}
            placeholder="Volitelně…"
            disabled={disabled}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>IČO</label>
          <input
            type="text"
            value={value.client_ico}
            onChange={e => set('client_ico', e.target.value)}
            disabled={disabled}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>DIČ</label>
          <input
            type="text"
            value={value.client_dic}
            onChange={e => set('client_dic', e.target.value)}
            disabled={disabled}
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label className={labelClass}>Poznámka</label>
        <input
          type="text"
          value={value.note}
          onChange={e => set('note', e.target.value)}
          placeholder="Volitelně…"
          disabled={disabled}
          className={inputClass}
        />
      </div>

      {/* PDF */}
      <div>
        <label className={labelClass}>PDF faktury</label>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          onChange={e => onFileChange(e.target.files?.[0] ?? null)}
          disabled={disabled}
          className="hidden"
        />
        {file ? (
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
            <FileText size={14} strokeWidth={1.5} className="text-emerald-600 shrink-0" />
            <span className="text-sm text-foreground truncate flex-1">{file.name}</span>
            <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
              {(file.size / 1024 / 1024).toFixed(1)} MB
            </span>
            <button
              type="button"
              onClick={() => {
                onFileChange(null)
                if (fileInputRef.current) fileInputRef.current.value = ''
              }}
              disabled={disabled}
              className="p-0.5 text-muted-foreground hover:text-red-500 transition-colors shrink-0"
            >
              <X size={14} strokeWidth={1.5} />
            </button>
          </div>
        ) : existingPdfName ? (
          <div className="flex items-center gap-2 bg-muted/40 border border-border rounded-lg px-3 py-2">
            <FileText size={14} strokeWidth={1.5} className="text-muted-foreground shrink-0" />
            <span className="text-sm text-foreground truncate flex-1">{existingPdfName}</span>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled}
              className="text-xs text-emerald-700 hover:underline shrink-0"
            >
              Nahradit
            </button>
            {onRemoveExistingPdf && (
              <button
                type="button"
                onClick={onRemoveExistingPdf}
                disabled={disabled}
                className="p-0.5 text-muted-foreground hover:text-red-500 transition-colors shrink-0"
              >
                <X size={14} strokeWidth={1.5} />
              </button>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            className="w-full flex items-center justify-center gap-2 border border-dashed border-border rounded-lg px-3 py-3 text-sm text-muted-foreground hover:border-emerald-400 hover:text-emerald-700 transition-colors"
          >
            <Paperclip size={14} strokeWidth={1.5} />
            Vybrat PDF (max {MAX_PDF_LABEL})
          </button>
        )}

        {/* Přepis je nabídka, ne krok navíc — pole jdou vyplnit i bez něj. */}
        {file && (
          <button
            type="button"
            onClick={runAiParse}
            disabled={disabled || isParsing}
            className="w-full flex items-center justify-center gap-2 mt-2 px-3 py-2 text-sm font-medium text-emerald-700 border border-emerald-200 bg-emerald-50/60 rounded-lg hover:bg-emerald-50 transition-colors disabled:opacity-50"
          >
            {isParsing ? (
              <Loader2 size={14} strokeWidth={1.5} className="animate-spin" />
            ) : (
              <Sparkles size={14} strokeWidth={1.5} />
            )}
            {isParsing ? 'Čtu fakturu…' : 'Načíst z PDF'}
          </button>
        )}

        {parseError && (
          <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
            <AlertCircle size={13} strokeWidth={1.5} className="shrink-0 mt-0.5" />
            <span>{parseError}</span>
          </div>
        )}
      </div>
    </div>
  )
}
