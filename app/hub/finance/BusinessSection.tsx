import Link from 'next/link'
import { Briefcase, FileCheck2, EyeOff, AlertCircle } from 'lucide-react'
import TaxCalculator from '@/components/TaxCalculator'
import { InvoiceArchive } from '@/components/InvoiceArchive'
import { TaxDeadlines } from '@/components/TaxDeadlines'
import { TaxNewsBlock } from '@/components/TaxNewsBlock'
import type { BusinessIncomeSummary, IncomeLine } from './finance-actions'
import type { InvoiceArchiveData, InvoiceProjectOption } from './invoice-actions'
import type { TaxNewsData } from './tax-news-actions'

function formatAmount(amount: number) {
  return new Intl.NumberFormat('cs-CZ', {
    style: 'currency',
    currency: 'CZK',
    maximumFractionDigits: 0,
  }).format(amount)
}

function projectsLabel(count: number) {
  if (count === 1) return '1 zakázka'
  if (count >= 2 && count <= 4) return `${count} zakázky`
  return `${count} zakázek`
}

function LineCard({
  line,
  title,
  subtitle,
  tone,
  icon,
}: {
  line: IncomeLine
  title: string
  subtitle: string
  tone: 'declared' | 'undeclared'
  icon: React.ReactNode
}) {
  const declared = tone === 'declared'

  return (
    <div
      className={`rounded-xl border p-4 ${
        declared ? 'border-emerald-200 bg-emerald-50/50' : 'border-border bg-white'
      }`}
    >
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground leading-snug">{subtitle}</p>
        </div>
      </div>

      <p
        className={`text-2xl font-bold tabular-nums leading-none ${
          declared ? 'text-emerald-700' : 'text-foreground'
        }`}
      >
        {formatAmount(line.income)}
      </p>

      <div className="mt-3 space-y-1.5 text-xs">
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">Zakázky v příjmech</span>
          <span className="font-medium text-foreground tabular-nums">
            {projectsLabel(line.projectCount)}
            {line.transactionCount !== line.projectCount && (
              <span className="text-muted-foreground font-normal"> · {line.transactionCount} transakcí</span>
            )}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">Nezaplacené zakázky</span>
          <span
            className={`font-medium tabular-nums ${
              line.outstanding > 0 ? 'text-amber-700' : 'text-muted-foreground'
            }`}
          >
            {formatAmount(line.outstanding)}
          </span>
        </div>
      </div>
    </div>
  )
}

/**
 * Přehled podnikání: příjmy rozdělené na přiznanou a nepřiznanou linii
 * a daňová kalkulačka nad přiznanou linií.
 *
 * Rok se bere podle data zaplacení, ne podle vystavení faktury — daňová
 * evidence jede na hotovostním principu.
 */
export function BusinessSection({
  summary,
  invoices,
  projectOptions,
  taxNews,
  todayIso,
}: {
  summary: BusinessIncomeSummary
  invoices: InvoiceArchiveData
  projectOptions: InvoiceProjectOption[]
  taxNews: TaxNewsData
  /** Dnešek v Praze, spočítaný na serveru — klient by v jiné timezone posunul odpočty */
  todayIso: string
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center shadow-sm">
            <Briefcase size={15} strokeWidth={1.5} className="text-white" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">Příjmy z podnikání</h2>
            <p className="text-xs text-muted-foreground">Podle data zaplacení, ne vystavení faktury</p>
          </div>
        </div>

        <div className="flex items-center gap-1 flex-wrap">
          {summary.availableYears.map(y => (
            <Link
              key={y}
              href={`/hub/finance?tab=podnikani&year=${y}`}
              scroll={false}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                y === summary.year
                  ? 'bg-emerald-600 text-white font-medium'
                  : 'text-muted-foreground hover:bg-muted border border-border'
              }`}
            >
              {y}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <LineCard
          line={summary.declared}
          title="Přiznané"
          subtitle="Fakturováno na IČO — jde do přiznání"
          tone="declared"
          icon={<FileCheck2 size={16} className="text-emerald-600 shrink-0" strokeWidth={1.5} />}
        />
        <LineCard
          line={summary.undeclared}
          title="Nepřiznané"
          subtitle="Mimo daňový základ"
          tone="undeclared"
          icon={<EyeOff size={16} className="text-muted-foreground shrink-0" strokeWidth={1.5} />}
        />
      </div>

      <div className="flex items-start gap-2 text-xs text-muted-foreground bg-slate-50 border border-border rounded-lg px-3 py-2">
        <AlertCircle size={13} className="shrink-0 mt-0.5" strokeWidth={1.5} />
        <span>
          Celkový příjem za {summary.year}: <strong className="text-foreground">{formatAmount(summary.total)}</strong>{' '}
          — součet obou linií. Do daní níže vstupuje jen přiznaná část.
          {summary.declared.outstanding + summary.undeclared.outstanding > 0 &&
            ' Nezaplacené zakázky se počítají napříč roky: dokud peníze nedorazí, nepatří žádnému.'}
        </span>
      </div>

      {/* Archiv faktur je podsekce přiznané linie — faktura je doklad k příjmu,
          který do téhle linie spadá. Samostatná stránka by ten vztah rozbila. */}
      <div className="border-t border-border pt-6">
        <InvoiceArchive
          data={invoices}
          projects={projectOptions}
          description="Doklady k přiznané linii. Zdanitelný příjem vzniká datem zaplacení, ne vystavení."
        />
      </div>

      <div className="border-t border-border pt-6">
        <TaxCalculator defaultIncome={summary.declared.income} year={summary.year} />
      </div>

      {/* Termíny a novinky jdou až za čísla: napřed kolik, pak dokdy a co je nového. */}
      <div className="border-t border-border pt-6">
        <TaxDeadlines todayIso={todayIso} />
      </div>

      <div className="border-t border-border pt-6">
        <TaxNewsBlock data={taxNews} />
      </div>
    </div>
  )
}
