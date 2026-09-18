import { notFound } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, FileText, ExternalLink, Sparkles, AlertTriangle, Clock, Landmark, Paperclip,
} from 'lucide-react'
import { getInvoiceDetail, getInvoiceProjectOptions } from '@/app/hub/finance/invoice-actions'
import type { InvoiceDetail } from '@/app/hub/finance/invoice-actions'
import { InvoiceDetailActions } from '@/components/InvoiceDetailActions'
import { INVOICE_INCOME_CATEGORY } from '@/lib/invoice-constants'
import { formatDate, formatDateTime } from '@/lib/utils'

interface PageProps {
  params: { id: string }
}

function formatAmount(amount: number, currency: string) {
  return new Intl.NumberFormat('cs-CZ', { style: 'currency', currency }).format(amount)
}

function formatFileSize(bytes: number | null) {
  if (bytes === null) return ''
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} kB`
}

function Field({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{label}</dt>
      <dd className={`text-sm text-foreground mt-0.5 ${mono ? 'tabular-nums' : ''}`}>
        {value && value.trim() !== '' ? value : <span className="text-muted-foreground">—</span>}
      </dd>
    </div>
  )
}

function Card({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-border rounded-2xl p-5">
      <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-4">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  )
}

/**
 * Řádky AI přepisu. Ukazují se jen pole, která model skutečně našel —
 * a odlišeně ta, kde se uložená hodnota od přepisu liší (ruční oprava).
 */
function aiRows(invoice: InvoiceDetail) {
  const extract = invoice.ai_extracted
  if (!extract) return []

  const rows: { label: string; ai: string | null; saved: string | null }[] = [
    { label: 'Číslo faktury', ai: extract.invoice_number ?? null, saved: invoice.invoice_number },
    { label: 'Vystaveno', ai: extract.issued_on ?? null, saved: invoice.issued_on },
    { label: 'Splatnost', ai: extract.due_on ?? null, saved: invoice.due_on },
    {
      label: 'Částka',
      ai: typeof extract.amount === 'number' ? String(extract.amount) : null,
      saved: String(invoice.amount),
    },
    { label: 'Měna', ai: extract.currency ?? null, saved: invoice.currency },
    { label: 'Odběratel', ai: extract.client_name ?? null, saved: invoice.client_name },
    { label: 'IČO', ai: extract.client_ico ?? null, saved: invoice.client_ico },
    { label: 'DIČ', ai: extract.client_dic ?? null, saved: invoice.client_dic },
  ]

  return rows
    .filter(row => row.ai !== null && row.ai.trim() !== '')
    .map(row => ({
      ...row,
      differs: (row.ai ?? '').trim() !== (row.saved ?? '').trim(),
    }))
}

export default async function InvoiceDetailPage({ params }: PageProps) {
  const invoice = await getInvoiceDetail(params.id)
  if (!invoice) notFound()

  const projects = await getInvoiceProjectOptions()

  const today = new Date().toISOString().slice(0, 10)
  const overdue = invoice.paid_on === null && invoice.due_on !== null && invoice.due_on < today
  const extracted = aiRows(invoice)
  const pdfHref = `/api/invoices/${invoice.id}/pdf`

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/faktury"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft size={14} strokeWidth={1.5} />
          Zpět na faktury
        </Link>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-2xl font-semibold text-foreground tracking-tight">
                Faktura {invoice.invoice_number}
              </h1>
              {invoice.paid_on ? (
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                  Zaplaceno
                </span>
              ) : overdue ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-red-50 text-red-700 ring-1 ring-red-200">
                  <Clock size={10} strokeWidth={1.5} />
                  Po splatnosti
                </span>
              ) : (
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 ring-1 ring-amber-200">
                  Pohledávka
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {formatAmount(invoice.amount, invoice.currency)} · vystaveno {formatDate(invoice.issued_on)}
            </p>
          </div>

          <InvoiceDetailActions invoice={invoice} projects={projects} />
        </div>
      </div>

      {invoice.duplicate_risk && (
        <div className="flex items-start gap-2.5 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <AlertTriangle size={15} strokeWidth={1.5} className="shrink-0 mt-0.5" />
          <span>
            Zakázka má v přiznané linii i vlastní příjem, který tahle faktura nezastupuje (typicky
            záloha a doplatek). Zkontroluj, že se stejné peníze nezapočítaly dvakrát.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        <div className="lg:col-span-2 space-y-5">
          <Card title="Údaje z faktury" icon={<FileText size={14} strokeWidth={1.5} className="text-emerald-600" />}>
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-y-4 gap-x-4">
              <Field label="Číslo faktury" value={invoice.invoice_number} mono />
              <Field label="Částka" value={formatAmount(invoice.amount, invoice.currency)} mono />
              <Field label="Měna" value={invoice.currency} />
              <Field label="Vystaveno" value={formatDate(invoice.issued_on)} />
              <Field label="Splatnost" value={invoice.due_on ? formatDate(invoice.due_on) : null} />
              <Field label="Zaplaceno" value={invoice.paid_on ? formatDate(invoice.paid_on) : null} />
              <Field label="Odběratel" value={invoice.client_name} />
              <Field label="IČO" value={invoice.client_ico} mono />
              <Field label="DIČ" value={invoice.client_dic} mono />
            </dl>
            <div className="mt-4 pt-4 border-t border-border">
              <Field label="Poznámka" value={invoice.note} />
            </div>
          </Card>

          {invoice.has_pdf ? (
            <Card title="PDF dokladu" icon={<Paperclip size={14} strokeWidth={1.5} className="text-emerald-600" />}>
              <div className="flex items-center gap-2 flex-wrap mb-3">
                <span className="text-sm text-foreground truncate">
                  {invoice.pdf_filename ?? `faktura-${invoice.invoice_number}.pdf`}
                </span>
                {invoice.pdf_size !== null && (
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {formatFileSize(invoice.pdf_size)}
                  </span>
                )}
                <a
                  href={pdfHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 ring-1 ring-emerald-200 px-2.5 py-1 rounded-lg hover:bg-emerald-100 transition-colors"
                >
                  <ExternalLink size={11} strokeWidth={1.5} />
                  Otevřít v novém okně
                </a>
              </div>
              {/* Náhled je pohodlí, ne jediná cesta k dokladu — proto i odkaz výš. */}
              <object
                data={pdfHref}
                type="application/pdf"
                className="w-full h-[600px] rounded-xl border border-border bg-muted/30 hidden sm:block"
              >
                <p className="text-sm text-muted-foreground p-4">
                  Náhled PDF tenhle prohlížeč nezobrazí — otevři doklad odkazem výš.
                </p>
              </object>
            </Card>
          ) : (
            <Card title="PDF dokladu" icon={<Paperclip size={14} strokeWidth={1.5} className="text-muted-foreground" />}>
              <p className="text-sm text-muted-foreground">
                K faktuře není přiložené PDF. Přes „Upravit" ho jde doplnit — AI z něj rovnou
                přečte údaje.
              </p>
            </Card>
          )}
        </div>

        <div className="space-y-5">
          <Card title="Zakázka" icon={<ExternalLink size={14} strokeWidth={1.5} className="text-brand-600" />}>
            {invoice.project_href ? (
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">{invoice.project_client_name}</p>
                {invoice.project_description && (
                  <p className="text-sm text-muted-foreground">{invoice.project_description}</p>
                )}
                <Link
                  href={invoice.project_href}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-700 hover:text-brand-800 transition-colors"
                >
                  Otevřít zakázku
                  <ExternalLink size={11} strokeWidth={1.5} />
                </Link>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Faktura není navázaná na žádnou zakázku. Přes „Upravit" ji jde přiřadit.
              </p>
            )}
          </Card>

          <Card title="Přiznaná linie" icon={<Landmark size={14} strokeWidth={1.5} className="text-emerald-600" />}>
            {invoice.ledger ? (
              <div className="space-y-3">
                <dl className="space-y-3">
                  <Field label="Příjem k datu" value={formatDate(invoice.ledger.date)} />
                  <Field
                    label="Částka v ledgeru"
                    value={formatAmount(invoice.ledger.amount, invoice.currency)}
                    mono
                  />
                  <Field label="Kategorie" value={invoice.ledger.category} />
                </dl>
                <p className="text-xs text-muted-foreground border-t border-border pt-3">
                  {invoice.ledger.owned_by_invoice
                    ? `Příjem založila tahle faktura (kategorie „${INVOICE_INCOME_CATEGORY}"). Smazání faktury ho z ledgeru odebere.`
                    : 'Příjem už měla v ledgeru zakázka — faktura ho jen zastupuje. Smazání faktury ho nechá být.'}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Bez data zaplacení je faktura pohledávka — do daňového základu nevstupuje a
                v přiznané linii nemá žádný příjem.
              </p>
            )}
          </Card>

          <Card title="Co z PDF přečetla AI" icon={<Sparkles size={14} strokeWidth={1.5} className="text-emerald-600" />}>
            {extracted.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                U téhle faktury není uložený AI přepis — údaje byly vyplněné ručně.
              </p>
            ) : (
              <div className="space-y-2">
                {extracted.map(row => (
                  <div key={row.label} className="flex items-start justify-between gap-3 text-sm">
                    <span className="text-muted-foreground shrink-0">{row.label}</span>
                    <span className="text-right min-w-0">
                      <span className="text-foreground break-words">{row.ai}</span>
                      {row.differs && (
                        <span className="block text-[11px] text-amber-700 mt-0.5">
                          ručně upraveno na „{row.saved ?? '—'}"
                        </span>
                      )}
                    </span>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground border-t border-border pt-3 mt-3">
                  Surový výstup přepisu pro dohledatelnost. Platí vždy uložené údaje výše, ne tenhle
                  přepis.
                </p>
              </div>
            )}
          </Card>

          <div className="text-xs text-muted-foreground px-1 space-y-0.5">
            <p>Přidáno do evidence {formatDateTime(invoice.created_at)}</p>
            {invoice.updated_at && <p>Naposledy upraveno {formatDateTime(invoice.updated_at)}</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
