import type { PricingAnalysis } from '@/lib/admin/offers/pricing-analysis'
import type { VariantKey } from '@/lib/admin/offers/pricing'
import { cn } from '@/lib/utils'

/**
 * Rozbor ceny jen pro Kryštofa (R-160). Klient ho nikdy nevidí: karta nabídky
 * ho ukazuje v adminu, na stránku nabídky se z něj nedostane nic.
 */

const czk = (n: number) => `${n.toLocaleString('cs-CZ')} Kč`

function Block({ title, lines }: { title: string; lines: string[] }) {
  if (lines.length === 0) return null
  return (
    <div className="flex flex-col gap-1.5">
      <h4 className="text-sm font-semibold text-ink">{title}</h4>
      <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-ink marker:text-navy-300">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  )
}

export function PricingAnalysisBox({ analysis, recommended }: { analysis: PricingAnalysis; recommended: VariantKey }) {
  return (
    <details className="group rounded-chip border border-navy-100 bg-navy-50/40">
      <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 px-4 text-sm font-semibold text-ink">
        <span>Jak je cena složená</span>
        <span className="text-xs font-normal text-quiet">jen pro vás, klient to neuvidí</span>
      </summary>
      <div className="flex flex-col gap-5 border-t border-navy-100 px-4 pb-4 pt-4">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead>
              <tr className="text-xs text-quiet">
                <th className="py-1.5 pr-3 font-normal">Varianta</th>
                <th className="py-1.5 pr-3 font-normal">Cena</th>
                <th className="py-1.5 pr-3 font-normal">Rozmezí v pravidlech</th>
                <th className="py-1.5 pr-3 font-normal">Záloha / po předání</th>
                <th className="py-1.5 pr-3 font-normal">1. rok se správou</th>
                <th className="py-1.5 font-normal">Zaplatí se z</th>
              </tr>
            </thead>
            <tbody>
              {analysis.variants.map((v) => (
                <tr key={v.key} className="border-t border-navy-100">
                  <td className={cn('py-2 pr-3 text-ink', v.key === recommended && 'font-semibold')}>
                    {v.name}
                    {v.key === recommended && <span className="block text-xs font-normal text-quiet">doporučená</span>}
                  </td>
                  <td className="py-2 pr-3 font-num text-ink">
                    {czk(v.price)}
                    {v.price !== v.proposed && <span className="block text-xs text-quiet">pravidla {czk(v.proposed)}</span>}
                  </td>
                  <td className="py-2 pr-3 font-num text-quiet">{v.range ? `${czk(v.range.min)}–${czk(v.range.max)}` : '–'}</td>
                  <td className="py-2 pr-3 font-num text-ink">
                    {czk(v.deposit)}
                    <span className="block text-xs text-quiet">{czk(v.rest)}</span>
                  </td>
                  <td className="py-2 pr-3 font-num text-ink">{czk(v.firstYear)}</td>
                  <td className="py-2 font-num text-ink">
                    {v.paybackJobs === null ? '–' : `${v.paybackJobs.toLocaleString('cs-CZ')} ${v.paybackJobs === 1 ? 'zakázky' : 'zakázek'}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Block title="Odkud ceny jsou" lines={analysis.origin} />
        <Block title="Jak nabídku poskládat" lines={analysis.combine} />
        <Block title="Když bude smlouvat" lines={analysis.negotiate} />
        <Block title="Co si ověřit, než nabídka odejde" lines={analysis.check} />
      </div>
    </details>
  )
}
