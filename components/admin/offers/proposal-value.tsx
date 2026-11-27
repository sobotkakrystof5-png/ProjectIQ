import { CONFIDENCE_LABEL, type ProposalInternal, type ProposalValue } from '@/lib/admin/offers/proposal-model'
import { POSITION_LABEL, type Position } from '@/lib/admin/offers/pricing'

/**
 * Odhad hodnoty pro klienta (N2): jen pro Kryštofa, na stránku nabídky nikdy.
 * Vždy jako odhad s předpoklady a jistotou (plán, oddíl 2).
 */

const czk = (n: number) => `${n.toLocaleString('cs-CZ')} Kč`
const range = (r: { min: number; max: number }, unit: (n: number) => string) =>
  r.min === r.max ? unit(r.min) : `${unit(r.min)} – ${unit(r.max)}`

export function ProposalValueBox({
  value,
  internal,
  position,
  bandText,
}: {
  value: ProposalValue
  internal: ProposalInternal | null
  position: Position
  bandText: string
}) {
  return (
    <div className="flex flex-col gap-3 rounded-chip bg-navy-50 px-4 py-4">
      <p className="text-xs font-semibold text-ink">Odhad hodnoty pro klienta (je to odhad, ne fakt)</p>
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-quiet">Jedna zakázka klienta</dt>
          <dd className="text-ink">
            {value.typicalJob ? (
              <>
                <span className="font-num font-semibold">{range(value.typicalJob, czk)}</span>{' '}
                <span className="text-quiet">({CONFIDENCE_LABEL[value.jobConfidence]})</span>
              </>
            ) : (
              <span className="text-quiet">Nezjištěno. Zeptejte se klienta.</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-quiet">Pásmo ceny a pozice</dt>
          <dd className="text-ink">
            {bandText} · {POSITION_LABEL[position]}
          </dd>
        </div>
        {value.inquiries && (
          <div>
            <dt className="text-xs text-quiet">Poptávky z webu měsíčně</dt>
            <dd className="font-num text-ink">
              {range(value.inquiries, (n) => String(n))}
              {value.winRate !== null && (
                <span className="font-sans text-quiet">, zakázka z {Math.round(value.winRate * 100)} %</span>
              )}
            </dd>
          </div>
        )}
        {value.yearly && (
          <div>
            <dt className="text-xs text-quiet">Za rok může web přinést</dt>
            <dd className="text-ink">
              <span className="font-num font-semibold">{range(value.yearly, czk)}</span>{' '}
              <span className="text-quiet">({CONFIDENCE_LABEL[value.confidence]})</span>
            </dd>
          </div>
        )}
      </dl>
      {internal?.positionReason && <p className="text-sm leading-6 text-ink">{internal.positionReason}</p>}
      {value.currentLoss && <p className="text-sm leading-6 text-ink">{value.currentLoss}</p>}
      {value.assumptions.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-quiet">Předpoklady</p>
          <ul className="mt-1 flex list-disc flex-col gap-0.5 pl-5 text-sm leading-6 text-ink">
            {value.assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      )}
      {value.askClient.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-quiet">Zjistit od klienta</p>
          <ul className="mt-1 flex list-disc flex-col gap-0.5 pl-5 text-sm leading-6 text-ink">
            {value.askClient.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
