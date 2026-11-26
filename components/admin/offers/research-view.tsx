import { ExternalLink } from 'lucide-react'
import type { Claim, OfferResearchResult } from '@/lib/admin/offers/result'
import { cn } from '@/lib/utils'

/**
 * Výsledek rozboru firmy (navrhovač nabídek, N1). Jen zobrazení.
 *
 * Text pochází od modelu, který četl cizí weby: vykresluje se **jen jako
 * text**, odkazy jen ty, které prošly `safeHttpUrl` už při uložení
 * (`normalizeResult`), a s `rel="noopener noreferrer nofollow"`.
 * Ke každému tvrzení patří čísla zdrojů dole, jako v knize.
 */

const STATE_LABEL: Record<OfferResearchResult['web']['state'], string> = {
  none: 'Web nemá',
  outdated: 'Zastaralý web',
  ok: 'Použitelný web',
  good: 'Dobrý web',
}

const CONFIDENCE_LABEL = { low: 'nízká jistota', medium: 'střední jistota', high: 'vysoká jistota' } as const
const DIRECTION_LABEL = { up: 'spíš víc', down: 'spíš méně', neutral: 'bez vlivu' } as const

const czk = (n: number) => `${new Intl.NumberFormat('cs-CZ').format(n)} Kč`

function Refs({ sources, anchor }: { sources: number[]; anchor: string }) {
  if (sources.length === 0) return null
  return (
    <span className="ml-1 whitespace-nowrap font-num text-xs text-quiet">
      {sources.map((i, n) => (
        <span key={i}>
          {n > 0 && ' '}
          <a href={`#${anchor}-${i}`} className="underline decoration-navy-200 underline-offset-2 hover:text-ink">
            [{i + 1}]
          </a>
        </span>
      ))}
    </span>
  )
}

function ClaimList({ items, anchor, empty }: { items: Claim[]; anchor: string; empty?: string }) {
  if (items.length === 0) return empty ? <p className="text-sm text-quiet">{empty}</p> : null
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((claim, i) => (
        <li key={i} className="text-sm leading-6 text-ink">
          {claim.text}
          <Refs sources={claim.sources} anchor={anchor} />
        </li>
      ))}
    </ul>
  )
}

function Block({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {children}
    </div>
  )
}

export function ResearchView({ result, anchor }: { result: OfferResearchResult; anchor: string }) {
  const { web, company, reviews, typical_job: job } = result
  const facts = [
    company.legal_form,
    company.ico ? `IČO ${company.ico}` : null,
    company.founded_year ? `od roku ${company.founded_year}` : null,
    company.city,
    company.industry,
  ].filter(Boolean)

  return (
    <div className="flex flex-col gap-6">
      <Block title="Firma">
        <p className="text-sm leading-6 text-ink">{company.summary}</p>
        {facts.length > 0 && <p className="font-num text-xs text-quiet">{facts.join(' · ')}</p>}
        <ClaimList items={company.findings} anchor={anchor} />
      </Block>

      <Block title={STATE_LABEL[web.state]}>
        {web.url && (
          <a
            href={web.url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="inline-flex w-fit items-center gap-1 break-all text-sm text-navy-700 underline underline-offset-2"
          >
            {web.url.replace(/^https?:\/\//, '')}
            <ExternalLink size={13} strokeWidth={1.75} aria-hidden />
          </a>
        )}
        {web.tech && <p className="text-xs text-quiet">Běží na: {web.tech}</p>}
        <ClaimList items={web.findings} anchor={anchor} />
        {web.gaps.length > 0 && (
          <div className="flex flex-col gap-1.5 rounded-chip bg-navy-50 px-4 py-3">
            <p className="text-xs font-semibold text-ink">Co webu chybí, aby nosil poptávky</p>
            <ClaimList items={web.gaps} anchor={anchor} />
          </div>
        )}
      </Block>

      <Block title="Typická zakázka klienta">
        {job.min_czk !== null || job.max_czk !== null ? (
          <p className="text-sm text-ink">
            <span className="font-num font-semibold">
              {job.min_czk !== null && job.max_czk !== null && job.min_czk !== job.max_czk
                ? `${czk(job.min_czk)} – ${czk(job.max_czk)}`
                : czk((job.min_czk ?? job.max_czk) as number)}
            </span>{' '}
            <span className="text-quiet">({CONFIDENCE_LABEL[job.confidence]})</span>
            <Refs sources={job.sources} anchor={anchor} />
          </p>
        ) : (
          <p className="text-sm text-quiet">Nezjištěno. Zeptejte se klienta.</p>
        )}
        {job.reasoning && <p className="text-sm leading-6 text-quiet">{job.reasoning}</p>}
      </Block>

      {(reviews.count !== null || reviews.praised.length > 0 || reviews.criticized.length > 0) && (
        <Block title="Recenze">
          {reviews.count !== null && (
            <p className="text-sm text-ink">
              <span className="font-num">{reviews.count}</span> recenzí
              {reviews.rating !== null && (
                <>
                  , průměr <span className="font-num">{reviews.rating.toLocaleString('cs-CZ')}</span> z 5
                </>
              )}
              <Refs sources={reviews.sources} anchor={anchor} />
            </p>
          )}
          {reviews.praised.length > 0 && (
            <>
              <p className="text-xs font-semibold text-quiet">Chválí</p>
              <ClaimList items={reviews.praised} anchor={anchor} />
            </>
          )}
          {reviews.criticized.length > 0 && (
            <>
              <p className="text-xs font-semibold text-quiet">Vytýkají</p>
              <ClaimList items={reviews.criticized} anchor={anchor} />
            </>
          )}
        </Block>
      )}

      {result.signals.length > 0 && (
        <Block title="Kolik si může dovolit">
          <ul className="flex flex-col gap-1.5">
            {result.signals.map((s, i) => (
              <li key={i} className="text-sm leading-6 text-ink">
                <span className="mr-1.5 font-num text-xs text-quiet">{DIRECTION_LABEL[s.direction]}</span>
                {s.text}
                <Refs sources={s.sources} anchor={anchor} />
              </li>
            ))}
          </ul>
        </Block>
      )}

      {result.competitors.length > 0 && (
        <Block title="Konkurence v okolí">
          <ul className="flex flex-col gap-2">
            {result.competitors.map((c, i) => (
              <li key={i} className="text-sm leading-6 text-ink">
                <span className="font-semibold">{c.name}</span>
                {c.url && (
                  <>
                    {' · '}
                    <a href={c.url} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-navy-700 underline underline-offset-2">
                      {c.url.replace(/^https?:\/\//, '')}
                    </a>
                  </>
                )}
                {c.note && <span className="text-quiet"> — {c.note}</span>}
                <Refs sources={c.sources} anchor={anchor} />
              </li>
            ))}
          </ul>
        </Block>
      )}

      {result.warnings.length > 0 && (
        <Block title="Varování">
          <div className="rounded-chip border border-danger/30 px-4 py-3">
            <ClaimList items={result.warnings} anchor={anchor} />
          </div>
        </Block>
      )}

      {result.ask_client.length > 0 && (
        <Block title="Zeptat se klienta">
          <ul className="flex list-disc flex-col gap-1 pl-5">
            {result.ask_client.map((q, i) => (
              <li key={i} className="text-sm leading-6 text-ink">
                {q}
              </li>
            ))}
          </ul>
        </Block>
      )}

      <Block title="Zdroje">
        <ol className="flex flex-col gap-1">
          {result.sources.map((s, i) => (
            <li key={s.url} id={`${anchor}-${i}`} className="flex gap-2 text-xs leading-5">
              <span className="shrink-0 font-num text-quiet">[{i + 1}]</span>
              <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="min-w-0 break-all text-navy-700 underline underline-offset-2">
                {s.title}
              </a>
            </li>
          ))}
        </ol>
        {result.dropped > 0 && (
          <p className="text-xs text-quiet">
            {result.dropped === 1 ? '1 tvrzení bez zdroje jsme vynechali.' : `${result.dropped} tvrzení bez zdroje jsme vynechali.`}
          </p>
        )}
      </Block>
    </div>
  )
}
