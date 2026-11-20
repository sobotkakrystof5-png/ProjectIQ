import { monthLong, monthShort, webLeadsSummary, type WebLeadMonth, type WebLeadStats } from '@/lib/client-web/stats'
import { cn } from '@/lib/utils'

/**
 * Poptávky z webu klienta po měsících (KP17, R-129). Sdílí admin (detail
 * zakázky) i klientský prostor (panel O zakázce, detail projektu).
 *
 * Jedna řada — kolik lidí napsalo nebo objednalo za měsíc dohromady, takže
 * bez legendy a jednou barvou. Rozdělení na poptávky a objednávky je textem
 * (dva odstíny navy od sebe validátor barev neodliší dost spolehlivě).
 * Bez knihovny a bez JavaScriptu: hodnota měsíce se ukáže při najetí myší,
 * čtečka dostane větu a tabulku.
 */

const split = (m: Pick<WebLeadMonth, 'poptavky' | 'objednavky'>): string => {
  const parts: string[] = []
  if (m.poptavky > 0) parts.push(m.poptavky === 1 ? '1 poptávka' : m.poptavky <= 4 ? `${m.poptavky} poptávky` : `${m.poptavky} poptávek`)
  if (m.objednavky > 0) parts.push(m.objednavky === 1 ? '1 objednávka' : m.objednavky <= 4 ? `${m.objednavky} objednávky` : `${m.objednavky} objednávek`)
  return parts.join(', ')
}

const fmt = (n: number) => n.toLocaleString('cs-CZ')

function Stat({ label, value, compact }: { label: string; value: number; compact: boolean }) {
  return (
    <div>
      <dt className="text-xs text-quiet">{label}</dt>
      <dd className={cn('font-num font-semibold text-ink', compact ? 'text-lg' : 'text-2xl')}>{fmt(value)}</dd>
    </div>
  )
}

export function WebLeadsChart({
  stats,
  compact = false,
  emptyText = 'Jakmile vám někdo napíše přes web, uvidíte to tady.',
}: {
  stats: WebLeadStats
  /** Úzký sloupec (panel O zakázce): menší čísla, popisek u každého druhého měsíce. */
  compact?: boolean
  emptyText?: string
}) {
  const totals = stats.months.map((m) => m.poptavky + m.objednavky)
  const max = Math.max(0, ...totals)
  const height = compact ? 64 : 112
  const both = stats.hasOrders && stats.hasRequests
  const current = stats.months[stats.months.length - 1]

  return (
    <div>
      <dl className="flex flex-wrap gap-x-6 gap-y-2">
        <Stat label="Tento měsíc" value={stats.thisMonth} compact={compact} />
        <Stat label="Minulý měsíc" value={stats.lastMonth} compact={compact} />
        {!compact && <Stat label="Za 12 měsíců" value={stats.total} compact={compact} />}
      </dl>
      {both && stats.thisMonth > 0 && <p className="mt-1 text-xs text-quiet">Tento měsíc {split(current)}.</p>}

      {stats.total === 0 ? (
        <p className="mt-3 text-sm text-quiet">{emptyText}</p>
      ) : (
        <figure className="mt-4">
          <div aria-hidden="true">
            <div className="relative">
              {/* Jediná vodorovná linka s nejvyšší hodnotou — měřítko bez osy. */}
              <div className="absolute inset-x-0 top-0 border-t border-dashed border-navy-100" />
              <span className="absolute -top-2 right-0 bg-surface pl-1 font-num text-[11px] leading-4 text-quiet">{fmt(max)}</span>
              <div className="flex items-end gap-0.5" style={{ height }}>
                {stats.months.map((m, i) => {
                  const total = totals[i]
                  const h = total === 0 ? 2 : Math.max(4, Math.round((total / max) * (height - 8)))
                  const edge = i < 3 ? 'left-0' : i > 8 ? 'right-0' : 'left-1/2 -translate-x-1/2'
                  return (
                    <div key={m.month} className="group relative flex h-full min-w-0 flex-1 items-end">
                      <div
                        className={cn('w-full', total === 0 ? 'rounded-sm bg-navy-100' : 'rounded-t-[4px] bg-navy-700 group-hover:bg-navy-800')}
                        style={{ height: h }}
                      />
                      <span
                        className={cn(
                          'pointer-events-none absolute bottom-full z-10 mb-1 whitespace-nowrap rounded-chip bg-navy-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100',
                          edge,
                        )}
                      >
                        {monthLong(m.month)}: <span className="font-num font-semibold">{fmt(total)}</span>
                        {total > 0 && both ? ` (${split(m)})` : ''}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
            <div className="mt-1 flex gap-0.5 border-t border-navy-100 pt-1">
              {stats.months.map((m, i) => (
                <span
                  key={m.month}
                  className={cn(
                    'min-w-0 flex-1 text-center text-[11px] leading-4',
                    i === stats.months.length - 1 ? 'font-semibold text-ink' : 'text-quiet',
                  )}
                >
                  {compact && (stats.months.length - 1 - i) % 2 === 1 ? '' : monthShort(m.month)}
                </span>
              ))}
            </div>
          </div>
          <figcaption className="sr-only">{webLeadsSummary(stats)}</figcaption>
          <table className="sr-only">
            <caption>Poptávky z webu po měsících</caption>
            <thead>
              <tr>
                <th scope="col">Měsíc</th>
                <th scope="col">Poptávky</th>
                <th scope="col">Objednávky</th>
              </tr>
            </thead>
            <tbody>
              {stats.months.map((m) => (
                <tr key={m.month}>
                  <th scope="row">{monthLong(m.month)}</th>
                  <td>{m.poptavky}</td>
                  <td>{m.objednavky}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </figure>
      )}
      {!compact && stats.total > 0 && <p className="mt-2 text-xs text-quiet">Počítáme odeslané formuláře z webu, ne návštěvy.</p>}
    </div>
  )
}
