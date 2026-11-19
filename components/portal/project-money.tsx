import QRCode from 'qrcode'
import { Check, FileDown, QrCode } from 'lucide-react'
import type { PortalInvoice, PortalMoney } from '@/lib/portal/money'
import { cn, formatDate } from '@/lib/utils'

// Peníze zakázky v klientském prostoru (KP13, R-121, R-125). Tři čísla nahoře
// a seznam faktur. Čísla počítá databáze stejně jako admin; tady se jen
// ukazují. Po splatnosti se píše klidně — klient mohl zaplatit včera.

const STATE_TEXT = {
  paid: 'Zaplaceno',
  open: 'Čeká na zaplacení',
  overdue: 'Po splatnosti',
  cancelled: 'Stornováno',
} as const

const STATE_STYLE = {
  paid: 'bg-navy-700 text-white',
  open: 'bg-navy-50 text-navy-700',
  overdue: 'border border-navy-200 bg-navy-50 text-navy-900',
  cancelled: 'border border-navy-100 bg-ground text-quiet',
} as const

const formatters = new Map<string, Intl.NumberFormat>()

function money(amount: number, currency: string): string {
  const whole = Number.isInteger(amount)
  const key = `${currency}:${whole}`
  let f = formatters.get(key)
  if (!f) {
    f = new Intl.NumberFormat('cs-CZ', {
      style: 'currency',
      currency,
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: 2,
    })
    formatters.set(key, f)
  }
  return f.format(amount)
}

/** IBAN po čtveřicích, jak se opisuje do bankovnictví. */
const groupIban = (iban: string) => iban.replace(/(.{4})/g, '$1 ').trim()

/** QR kód jako jedna SVG cesta — bez HTML z knihovny a bez obrázku z data: URL. */
function PaymentQr({ spayd }: { spayd: string }) {
  const { modules } = QRCode.create(spayd, { errorCorrectionLevel: 'M' })
  const margin = 2
  let d = ''
  for (let row = 0; row < modules.size; row++) {
    for (let col = 0; col < modules.size; col++) {
      if (modules.data[row * modules.size + col]) d += `M${col + margin} ${row + margin}h1v1h-1z`
    }
  }
  const box = modules.size + margin * 2
  return (
    <svg
      viewBox={`0 0 ${box} ${box}`}
      role="img"
      aria-label="QR kód pro zaplacení faktury"
      className="h-44 w-44 shrink-0 rounded-chip bg-surface text-navy-950"
      shapeRendering="crispEdges"
    >
      <path d={d} fill="currentColor" />
    </svg>
  )
}

function InvoiceRow({ invoice }: { invoice: PortalInvoice }) {
  const { state } = invoice
  return (
    <li className="rounded-box border border-navy-100 bg-surface p-5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 break-words font-medium text-ink">
          Faktura <span className="font-num">{invoice.number}</span>
        </p>
        <span
          className={cn(
            'shrink-0 whitespace-nowrap font-num text-base font-semibold text-ink',
            state === 'cancelled' && 'text-quiet line-through',
          )}
        >
          {money(invoice.amount, invoice.currency)}
        </span>
      </div>
      <p className="mt-0.5 text-xs text-quiet">
        Vystavená {formatDate(invoice.issuedOn)}
        {state !== 'paid' && state !== 'cancelled' && invoice.dueOn ? ` · splatná do ${formatDate(invoice.dueOn)}` : ''}
        {state === 'paid' && invoice.paidOn ? ` · zaplaceno ${formatDate(invoice.paidOn)}` : ''}
      </p>
      <span className={cn('mt-2 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold', STATE_STYLE[state])}>
        {state === 'paid' && <Check size={12} strokeWidth={2} aria-hidden="true" />}
        {STATE_TEXT[state]}
      </span>

      {state === 'overdue' && invoice.dueOn && (
        <p className="mt-3 text-sm text-ink">
          Splatnost byla {formatDate(invoice.dueOn)}. Jestli už je zaplaceno, nic dalšího dělat nemusíte.
        </p>
      )}
      {state === 'cancelled' && <p className="mt-3 text-sm text-quiet">Tuhle fakturu jsme zrušili, neplaťte ji.</p>}

      {(invoice.hasPdf || invoice.payment) && (
        <div className="mt-4 flex flex-wrap items-start gap-2">
          {invoice.hasPdf && (
            <a
              href={`/api/klient/faktury/${invoice.id}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-navy-100 px-4 text-sm font-medium text-ink hover:border-navy-300"
            >
              <FileDown size={16} strokeWidth={1.5} aria-hidden="true" />
              Stáhnout PDF
            </a>
          )}
          {invoice.payment && (
            <details className="group w-full sm:w-auto">
              <summary className="inline-flex min-h-[44px] cursor-pointer list-none items-center gap-1.5 rounded-full bg-navy-700 px-4 text-sm font-medium text-white hover:bg-navy-800 [&::-webkit-details-marker]:hidden">
                <QrCode size={16} strokeWidth={1.5} aria-hidden="true" />
                Zaplatit QR kódem
              </summary>
              <div className="mt-3 flex flex-col gap-4 rounded-box border border-navy-100 bg-ground p-4 sm:flex-row sm:items-center">
                <PaymentQr spayd={invoice.payment.spayd} />
                <dl className="space-y-1 text-sm">
                  <div>
                    <dt className="text-xs text-quiet">Částka</dt>
                    <dd className="font-num text-ink">{money(invoice.amount, invoice.currency)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-quiet">Účet</dt>
                    <dd className="font-num break-all text-ink">{groupIban(invoice.payment.account)}</dd>
                  </div>
                  {invoice.payment.variableSymbol && (
                    <div>
                      <dt className="text-xs text-quiet">Variabilní symbol</dt>
                      <dd className="font-num text-ink">{invoice.payment.variableSymbol}</dd>
                    </div>
                  )}
                  <p className="pt-1 text-xs text-quiet">Naskenujte kód v aplikaci své banky.</p>
                </dl>
              </div>
            </details>
          )}
        </div>
      )}
    </li>
  )
}

export function ProjectMoney({ money: summary, invoices }: { money: PortalMoney | null; invoices: PortalInvoice[] }) {
  if (!summary && invoices.length === 0) return null
  const otherCurrency = invoices.some((i) => i.currency !== 'CZK')

  return (
    <section className="mt-5" aria-labelledby="penize">
      <h2 id="penize" className="mb-3 text-sm font-semibold uppercase tracking-wider text-quiet">Peníze</h2>

      {summary && (
        <div className="rounded-box border border-navy-100 bg-surface p-5">
          <dl className="grid gap-3 sm:grid-cols-3">
            <div className="flex items-baseline justify-between gap-3 sm:block">
              <dt className="text-sm text-quiet">Cena</dt>
              <dd className="font-num text-lg font-semibold text-ink">{money(summary.price, summary.currency)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 sm:block">
              <dt className="text-sm text-quiet">Zaplaceno</dt>
              <dd className="font-num text-lg font-semibold text-ink">{money(summary.paid, summary.currency)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 sm:block">
              <dt className="text-sm text-quiet">Zbývá doplatit</dt>
              <dd className="font-num text-lg font-semibold text-ink">{money(summary.remaining, summary.currency)}</dd>
            </div>
          </dl>
          {summary.remaining === 0 && <p className="mt-3 text-sm text-quiet">Všechno je zaplacené. Děkujeme.</p>}
          {otherCurrency && <p className="mt-3 text-xs text-quiet">Faktury v jiné měně než v korunách se do součtu nepočítají.</p>}
        </div>
      )}

      {invoices.length > 0 ? (
        <>
          <h3 className="mb-2 mt-4 text-sm font-semibold text-ink">Faktury</h3>
          <ul className="space-y-3">
            {invoices.map((i) => (
              <InvoiceRow key={i.id} invoice={i} />
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-3 text-sm text-quiet">Faktury tu najdete, jakmile je vystavíme.</p>
      )}
    </section>
  )
}
