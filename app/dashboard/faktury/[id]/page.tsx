import { Badge } from '@/components/ui/badge'
import { PageHeader, PageShell } from '@/components/ws/app/page-header'
import { invoiceTone, toneVariant } from '@/lib/admin-status'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Ban, FileText, ExternalLink, Sparkles, AlertTriangle, Clock, Landmark, Paperclip,
} from 'lucide-react'
import { itemTotals } from '@/lib/invoice-pdf/totals'
import { getInvoiceDetail, getInvoiceProjectOptions, getPaymentCandidates } from '@/app/dashboard/finance/invoice-actions'
import type { InvoiceDetail } from '@/app/dashboard/finance/invoice-actions'
import { InvoiceDetailActions } from '@/components/InvoiceDetailActions'
import { IssuedInvoiceActions } from '@/components/admin/invoices/issued-actions'
import { PaymentMatch } from '@/components/admin/invoices/payment-match'
import { ContactActions } from '@/components/admin/contact-actions'
import { INVOICE_INCOME_CATEGORY } from '@/lib/invoice-constants'
import { cn, formatDate, formatDateTime } from '@/lib/utils'
import { Card as AdminCard, SECTION_LABEL } from '@/components/admin/card'
import { getPragueTodayISO } from '@/lib/prague-time'
import { isInvoiceOverdue } from '@/lib/invoice-status'
import { loadHandover } from '@/lib/admin/handover'

interface PageProps {
  params: Promise<{ id: string }>
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
      <dt className={cn(SECTION_LABEL, 'text-[11px]')}>{label}</dt>
      <dd className={cn('mt-0.5 text-sm text-ink', mono && 'font-num tabular-nums')}>
        {value && value.trim() !== '' ? value : <span className="text-quiet">—</span>}
      </dd>
    </div>
  )
}

/** Panel detailu faktury: plocha Dílků a štítek sekce místo vlastního nadpisu. */
function Card({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <AdminCard className="p-5">
      <h2 className={cn(SECTION_LABEL, 'mb-4 flex items-center gap-2 normal-case tracking-normal')}>
        {icon}
        {title}
      </h2>
      {children}
    </AdminCard>
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

export default async function InvoiceDetailPage(props: PageProps) {
  const params = await props.params
  const invoice = await getInvoiceDetail(params.id)
  if (!invoice) notFound()

  // Kandidáty na „tytéž peníze" hledáme jen tam, kde to má smysl: zaplacená
  // faktura se zakázkou, u které se ještě nerozhodlo (AD13).
  const [projects, candidates, handover] = await Promise.all([
    getInvoiceProjectOptions(),
    invoice.duplicate_risk ? getPaymentCandidates(invoice.id) : Promise.resolve([]),
    // Má zakázka vyplněný předávací dokument? Pak jde přiložit k faktuře (AD16).
    invoice.project_id ? loadHandover(invoice.project_id) : Promise.resolve(null),
  ])

  const today = getPragueTodayISO()
  const overdue = isInvoiceOverdue(invoice, today)
  const extracted = aiRows(invoice)
  const pdfHref = `/api/invoices/${invoice.id}/pdf`

  return (
    <PageShell width="wide">
      <div>
        <Link
          href="/dashboard/faktury"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-quiet transition-colors hover:text-ink"
        >
          <ArrowLeft size={14} strokeWidth={1.5} aria-hidden="true" />
          Zpět na faktury
        </Link>

        <PageHeader
          className="mt-4"
          title={`Faktura ${invoice.invoice_number}`}
          subtitle={`${formatAmount(invoice.amount, invoice.currency)} · vystaveno ${formatDate(invoice.issued_on)}`}
          action={
            <>
              <Badge variant={toneVariant(invoiceTone(Boolean(invoice.paid_on), overdue))}>
                {invoice.paid_on ? 'Zaplaceno' : overdue ? <><Clock size={10} strokeWidth={1.5} aria-hidden="true" />Po splatnosti</> : 'Pohledávka'}
              </Badge>
              {/* Vystavený doklad se neupravuje ani nemaže — opravuje se stornem (AD12). */}
              {invoice.issued ? (
                <IssuedInvoiceActions
                  id={invoice.id}
                  number={invoice.invoice_number}
                  defaultEmail={invoice.project_client_email}
                  cancelled={invoice.issued.cancelled_at !== null}
                  sentAt={invoice.issued.sent_at}
                  handoverReady={handover?.saved ?? false}
                />
              ) : (
                <InvoiceDetailActions invoice={invoice} projects={projects} />
              )}
            </>
          }
        />
      </div>

      {/* Dvojí započtení rozhoduje člověk, ne odhad podle částky (AD13). */}
      {invoice.duplicate_risk && candidates.length > 0 && (
        <PaymentMatch invoiceId={invoice.id} candidates={candidates} />
      )}
      {invoice.duplicate_risk && candidates.length === 0 && (
        <div className="flex items-start gap-2.5 rounded-chip border border-signal-line bg-signal-bg px-4 py-3 text-sm text-signal-ink">
          <AlertTriangle size={15} strokeWidth={1.5} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            Zakázka má v přiznané linii i vlastní příjem, který tahle faktura nezastupuje (typicky
            záloha a doplatek). Zkontrolujte, že se stejné peníze nezapočítaly dvakrát.
          </span>
        </div>
      )}

      {invoice.issued?.cancelled_at && (
        <div className="flex items-start gap-2.5 rounded-chip border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-ink">
          <Ban size={15} strokeWidth={1.5} className="mt-0.5 shrink-0 text-danger" aria-hidden="true" />
          <span>
            Faktura je stornovaná ({formatDate(invoice.issued.cancelled_at.slice(0, 10))}). V přiznání
            nefiguruje; oprava se dělá novou fakturou.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        <div className="lg:col-span-2 space-y-5">
          {invoice.issued && (
            <Card title="Položky" icon={<FileText size={14} strokeWidth={1.5} className="text-navy-600" />}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-quiet">
                    <th className="pb-2 font-medium">Popis</th>
                    <th className="pb-2 text-right font-medium">Počet</th>
                    <th className="pb-2 text-right font-medium">Cena za kus</th>
                    {invoice.issued.issuer.vatPayer && <th className="pb-2 text-right font-medium">DPH</th>}
                    <th className="pb-2 text-right font-medium">Celkem</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.issued.items.map((item, index) => (
                    <tr key={index} className="border-t border-navy-100">
                      <td className="py-2 pr-2">{item.description}</td>
                      <td className="py-2 text-right tabular-nums">{item.quantity}</td>
                      <td className="py-2 text-right tabular-nums">{formatAmount(item.unitPrice, invoice.currency)}</td>
                      {invoice.issued!.issuer.vatPayer && <td className="py-2 text-right tabular-nums">{item.vatRate} %</td>}
                      <td className="py-2 text-right tabular-nums">{formatAmount(itemTotals(item).total, invoice.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-4 border-t border-navy-100 pt-3 text-right text-sm font-semibold text-ink">
                Celkem {formatAmount(invoice.amount, invoice.currency)}
              </p>
              <p className="mt-3 text-xs text-quiet">
                Dodavatel: {invoice.issued.issuer.name}, IČO {invoice.issued.issuer.ico}
                {invoice.issued.issuer.vatPayer ? `, DIČ ${invoice.issued.issuer.dic}` : ' — neplátce DPH'}
                {invoice.issued.sent_at ? ` · odesláno ${formatDate(invoice.issued.sent_at.slice(0, 10))}` : ''}
              </p>
            </Card>
          )}

          <Card title="Údaje z faktury" icon={<FileText size={14} strokeWidth={1.5} className="text-navy-500" />}>
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
            <div className="mt-4 pt-4 border-t border-navy-100">
              <Field label="Poznámka" value={invoice.note} />
            </div>
          </Card>

          {invoice.has_pdf ? (
            <Card title="PDF dokladu" icon={<Paperclip size={14} strokeWidth={1.5} className="text-navy-500" />}>
              <div className="flex items-center gap-2 flex-wrap mb-3">
                <span className="text-sm text-ink truncate">
                  {invoice.pdf_filename ?? `faktura-${invoice.invoice_number}.pdf`}
                </span>
                {invoice.pdf_size !== null && (
                  <span className="font-num text-xs tabular-nums text-quiet">
                    {formatFileSize(invoice.pdf_size)}
                  </span>
                )}
                <a
                  href={pdfHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-full border border-input px-4 text-sm font-semibold text-ink transition-colors hover:bg-navy-50"
                >
                  <ExternalLink size={11} strokeWidth={1.5} />
                  Otevřít v novém okně
                </a>
              </div>
              {/* Náhled je pohodlí, ne jediná cesta k dokladu — proto i odkaz výš. */}
              <object
                data={pdfHref}
                type="application/pdf"
                className="w-full h-[600px] rounded-chip border border-navy-100 bg-muted/30 hidden sm:block"
              >
                <p className="text-sm text-quiet p-4">
                  Náhled PDF tenhle prohlížeč nezobrazí — otevři doklad odkazem výš.
                </p>
              </object>
            </Card>
          ) : invoice.issued ? (
            <Card title="PDF dokladu" icon={<Paperclip size={14} strokeWidth={1.5} className="text-navy-500" />}>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="truncate text-sm text-ink">faktura-{invoice.invoice_number}.pdf</span>
                <span className="text-xs text-quiet">vyrobí se při otevření</span>
                <a
                  href={pdfHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-full border border-input px-4 text-sm font-semibold text-ink transition-colors hover:bg-navy-50"
                >
                  <ExternalLink size={11} strokeWidth={1.5} />
                  Otevřít v novém okně
                </a>
              </div>
              <object
                data={pdfHref}
                type="application/pdf"
                className="hidden h-[600px] w-full rounded-box border border-navy-100 bg-navy-50/40 sm:block"
              >
                <p className="p-4 text-sm text-quiet">
                  Náhled PDF tenhle prohlížeč nezobrazí — otevři doklad odkazem výš.
                </p>
              </object>
            </Card>
          ) : (
            <Card title="PDF dokladu" icon={<Paperclip size={14} strokeWidth={1.5} className="text-navy-500" />}>
              <p className="text-sm text-quiet">
                K faktuře není přiložené PDF. Přes „Upravit" ho jde doplnit — AI z něj rovnou
                přečte údaje.
              </p>
            </Card>
          )}
        </div>

        <div className="space-y-5">
          <Card title="Zakázka" icon={<ExternalLink size={14} strokeWidth={1.5} className="text-navy-600" />}>
            {invoice.project_href ? (
              <div className="space-y-2">
                <p className="text-sm font-medium text-ink">{invoice.project_client_name}</p>
                {invoice.project_description && (
                  <p className="text-sm text-quiet">{invoice.project_description}</p>
                )}
                <Link
                  href={invoice.project_href}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-navy-700 hover:text-navy-800 transition-colors"
                >
                  Otevřít zakázku
                  <ExternalLink size={11} strokeWidth={1.5} />
                </Link>
                {/* Urgovat nezaplacenou fakturu jde odsud, bez opisování (AD10). */}
                <ContactActions
                  phone={invoice.project_client_phone}
                  email={invoice.project_client_email}
                  context={{ projectName: invoice.project_client_name }}
                />
              </div>
            ) : invoice.issued ? (
              // Vystavený doklad se neupravuje, takže odkaz na „Upravit" by lhal.
              <p className="text-sm text-quiet">
                Faktura není navázaná na žádnou zakázku. Příště ji vystavte přímo ze zakázky —
                předvyplní se odběratel i částka.
              </p>
            ) : (
              <p className="text-sm text-quiet">
                Faktura není navázaná na žádnou zakázku. Přes „Upravit" ji jde přiřadit.
              </p>
            )}
          </Card>

          <Card title="Přiznaná linie" icon={<Landmark size={14} strokeWidth={1.5} className="text-navy-500" />}>
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
                <p className="text-xs text-quiet border-t border-navy-100 pt-3">
                  {invoice.ledger.owned_by_invoice
                    ? `Příjem založila tahle faktura (kategorie „${INVOICE_INCOME_CATEGORY}"). Smazání faktury ho z ledgeru odebere.`
                    : 'Příjem už měla v ledgeru zakázka — faktura ho jen zastupuje. Smazání faktury ho nechá být.'}
                </p>
              </div>
            ) : (
              <p className="text-sm text-quiet">
                Bez data zaplacení je faktura pohledávka — do daňového základu nevstupuje a
                v přiznané linii nemá žádný příjem.
              </p>
            )}
          </Card>

          {/* U faktury vystavené tady se žádné PDF nečetlo — karta by jen mátla (AD12). */}
          {!invoice.issued && (
          <Card title="Co z PDF přečetla AI" icon={<Sparkles size={14} strokeWidth={1.5} className="text-navy-500" />}>
            {extracted.length === 0 ? (
              <p className="text-sm text-quiet">
                U téhle faktury není uložený AI přepis — údaje byly vyplněné ručně.
              </p>
            ) : (
              <div className="space-y-2">
                {extracted.map(row => (
                  <div key={row.label} className="flex items-start justify-between gap-3 text-sm">
                    <span className="text-quiet shrink-0">{row.label}</span>
                    <span className="text-right min-w-0">
                      <span className="text-ink break-words">{row.ai}</span>
                      {row.differs && (
                        <span className="mt-0.5 block text-[11px] text-signal-ink">
                          ručně upraveno na „{row.saved ?? '—'}"
                        </span>
                      )}
                    </span>
                  </div>
                ))}
                <p className="text-xs text-quiet border-t border-navy-100 pt-3 mt-3">
                  Surový výstup přepisu pro dohledatelnost. Platí vždy uložené údaje výše, ne tenhle
                  přepis.
                </p>
              </div>
            )}
          </Card>
          )}

          <div className="text-xs text-quiet px-1 space-y-0.5">
            <p>Přidáno do evidence {formatDateTime(invoice.created_at)}</p>
            {invoice.updated_at && <p>Naposledy upraveno {formatDateTime(invoice.updated_at)}</p>}
          </div>
        </div>
      </div>
    </PageShell>
  )
}
