'use client'

import { useMemo, useState } from 'react'
import { CalendarClock, ExternalLink, AlertTriangle, Info } from 'lucide-react'
import {
  getUpcomingTaxDeadlines, daysUntil,
  TAX_AUTHORITY_LABELS, TAX_FILING_ROUTE_LABELS,
  type TaxFilingRoute, type TaxDeadline,
} from '@/lib/tax-deadlines'

function formatDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('cs-CZ', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
}

function countdownLabel(days: number) {
  if (days === 0) return 'dnes'
  if (days === 1) return 'zítra'
  if (days < 30) return `za ${days} dní`
  if (days < 60) return 'za měsíc'
  return `za ${Math.round(days / 30)} měsíců`
}

const ROUTES: TaxFilingRoute[] = ['paper', 'electronic', 'advisor']

function DeadlineRow({ deadline, todayIso }: { deadline: TaxDeadline; todayIso: string }) {
  const days = daysUntil(deadline.date, todayIso)
  // Měsíc předem je poslední rozumná chvíle, kdy se dá něco stihnout
  // připravit; týden je už opravdu na spadnutí.
  const urgent = days <= 7
  const soon = !urgent && days <= 30

  return (
    <div className="flex items-start gap-3 py-3 px-3">
      <div className={`shrink-0 w-14 text-center rounded-lg py-1.5 ${
        urgent ? 'bg-red-50 ring-1 ring-red-200' : soon ? 'bg-amber-50 ring-1 ring-amber-200' : 'bg-muted'
      }`}>
        <p className={`text-base font-bold leading-none tabular-nums ${
          urgent ? 'text-red-700' : soon ? 'text-amber-700' : 'text-foreground'
        }`}>
          {deadline.date.slice(8)}
        </p>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          {new Date(Number(deadline.date.slice(0, 4)), Number(deadline.date.slice(5, 7)) - 1, 1)
            .toLocaleDateString('cs-CZ', { month: 'short' })}
        </p>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground ring-1 ring-border">
            {TAX_AUTHORITY_LABELS[deadline.authority]}
          </span>
          <span className={`text-[11px] font-medium ${
            urgent ? 'text-red-700' : soon ? 'text-amber-700' : 'text-muted-foreground'
          }`}>
            {countdownLabel(days)}
          </span>
        </div>

        <p className="text-sm font-medium text-foreground leading-snug">{deadline.title}</p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{deadline.description}</p>

        <div className="flex items-center gap-2 flex-wrap mt-1.5">
          <span className="text-[11px] text-muted-foreground">{formatDate(deadline.date)}</span>
          {deadline.shifted && (
            <span className="text-[11px] text-muted-foreground/80">
              (zákonné {formatDate(deadline.statutoryDate)} padlo na víkend nebo svátek)
            </span>
          )}
          <a
            href={deadline.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <ExternalLink size={9} strokeWidth={1.5} />
            Zdroj
          </a>
        </div>
      </div>
    </div>
  )
}

/**
 * Daňové termíny — pevný roční kalendář, ne feed.
 *
 * Lhůty plynou ze zákona, takže se nestahují: dopočítávají se z roku
 * a ze způsobu podání. Přepínač způsobu posune přiznání i oba přehledy
 * najednou — zadrátované datum by při jiné volbě lhalo o měsíc.
 */
export function TaxDeadlines({ todayIso }: { todayIso: string }) {
  const [route, setRoute] = useState<TaxFilingRoute>('electronic')

  const deadlines = useMemo(() => getUpcomingTaxDeadlines(todayIso, route), [todayIso, route])
  const nearest = deadlines.length > 0 ? daysUntil(deadlines[0].date, todayIso) : null

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-brand-50 rounded-lg flex items-center justify-center">
            <CalendarClock size={15} className="text-brand-600" strokeWidth={1.5} />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">Daňové termíny</h3>
            <p className="text-xs text-muted-foreground">Přiznání a přehledy pro ČSSZ a zdravotní pojišťovnu</p>
          </div>
        </div>

        <div className="flex items-center gap-1 flex-wrap">
          {ROUTES.map(r => (
            <button
              key={r}
              type="button"
              onClick={() => setRoute(r)}
              className={`px-2.5 py-1.5 text-xs rounded-lg transition-colors ${
                r === route
                  ? 'bg-brand-600 text-white font-medium'
                  : 'text-muted-foreground hover:bg-muted border border-border'
              }`}
            >
              {TAX_FILING_ROUTE_LABELS[r]}
            </button>
          ))}
        </div>
      </div>

      {nearest !== null && nearest <= 30 && (
        <div className="flex items-start gap-2 text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2">
          <AlertTriangle size={13} strokeWidth={1.5} className="shrink-0 mt-0.5" />
          <span>
            Nejbližší termín je {countdownLabel(nearest)}: <strong>{deadlines[0].title}</strong>.
          </span>
        </div>
      )}

      <div className="rounded-xl border border-border bg-white divide-y divide-border">
        {deadlines.map(d => (
          <DeadlineRow key={`${d.id}-${d.date}`} deadline={d} todayIso={todayIso} />
        ))}
      </div>

      <div className="flex items-start gap-2 text-[11px] text-muted-foreground bg-slate-50 border border-border rounded-lg px-3 py-2 leading-relaxed">
        <Info size={12} strokeWidth={1.5} className="shrink-0 mt-0.5" />
        <span>
          Termíny se počítají ze zákonných lhůt a posouvají se na nejbližší pracovní den.
          Přehledy se podávají do měsíce po lhůtě přiznání, proto je posune i změna způsobu
          podání. Lhůta s daňovým poradcem platí, jen když je plná moc uplatněná včas.
        </span>
      </div>
    </div>
  )
}
