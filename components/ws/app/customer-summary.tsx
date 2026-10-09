import Link from 'next/link'
import { Mail, Phone } from 'lucide-react'
import { LoyaltyCard, TimeRange } from '@/components/ws/brand'
import { SEGMENT_LABELS, type CustomerCard } from '@/lib/ws/today'
import { formatRelativeDay, pragueParts } from '@/lib/ws/time'
import { plural } from '@/lib/ws/plural'
import { cn } from '@/lib/ws/utils'

/** „+420777123456" → „+420 777 123 456" (jen české číslo, jinak beze změny). */
export function formatPhone(phone: string): string {
  const m = phone.match(/^\+420(\d{3})(\d{3})(\d{3})$/)
  return m ? `+420 ${m[1]} ${m[2]} ${m[3]}` : phone
}

/**
 * Karta zákazníka: skupina, kontakt, návštěvy, příští termín, věrnostní karta.
 * Na Dnes vpravo (mockup C) i v pravém panelu.
 */
export function CustomerSummary({
  card,
  today,
  businessName,
  detailHref,
}: {
  card: CustomerCard
  today: string
  businessName: string
  /** Odkaz na celou kartu v panelu — na Dnes ano, v panelu samotném ne. */
  detailHref?: string
}) {
  const reward = card.loyalty?.reward || 'odměna podle nastavení'
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="min-w-0 text-xl font-semibold tracking-[-0.02em]">{card.name}</h3>
          {card.segment && (
            <span className="rounded-full bg-navy-50 px-2.5 py-1 font-num text-[11px] uppercase tracking-[0.08em] text-navy-700 dark:bg-navy-800 dark:text-navy-200">
              {SEGMENT_LABELS[card.segment]}
            </span>
          )}
        </div>
        <ul className="flex flex-col gap-0.5 text-[15px]">
          {card.phone && (
            <li>
              <a href={`tel:${card.phone}`} className="inline-flex min-h-9 items-center gap-2 text-ink underline-offset-4 hover:underline">
                <Phone aria-hidden size={16} strokeWidth={1.5} className="text-quiet" />
                <span className="font-num text-sm">{formatPhone(card.phone)}</span>
              </a>
            </li>
          )}
          {card.email && (
            <li>
              <a href={`mailto:${card.email}`} className="inline-flex min-h-9 max-w-full items-center gap-2 text-ink underline-offset-4 hover:underline">
                <Mail aria-hidden size={16} strokeWidth={1.5} className="shrink-0 text-quiet" />
                <span className="truncate">{card.email}</span>
              </a>
            </li>
          )}
        </ul>
      </div>

      <dl className="grid grid-cols-2 gap-3">
        <Stat label="Návštěvy" value={plural(card.visits, ['návštěva', 'návštěvy', 'návštěv'])} />
        <Stat label="Naposledy" value={card.lastVisit ? formatRelativeDay(pragueParts(card.lastVisit).date, today) : 'zatím ne'} />
        <div className="col-span-2 rounded-chip border px-3 py-2.5">
          <dt className="font-num text-[11px] uppercase tracking-[0.08em] text-quiet">Příští termín</dt>
          <dd className="mt-0.5 text-[15px]">
            {card.nextVisit ? (
              <>
                <span className="font-num">{formatRelativeDay(pragueParts(card.nextVisit.start).date, today)}, </span>
                <TimeRange start={card.nextVisit.start} end={card.nextVisit.end} />
                {card.nextVisit.service && <span className="text-quiet"> · {card.nextVisit.service}</span>}
              </>
            ) : (
              <span className="text-quiet">Žádný domluvený</span>
            )}
          </dd>
        </div>
      </dl>

      {card.loyalty && (
        <LoyaltyCard
          customer={card.name}
          business={businessName}
          stamps={card.loyalty.stamps}
          total={card.loyalty.needed}
          reward={reward}
        />
      )}

      {card.note && (
        <p className="whitespace-pre-line rounded-chip bg-navy-50 px-3 py-2.5 text-sm text-quiet dark:bg-navy-800 dark:text-navy-200">
          {card.note}
        </p>
      )}

      {detailHref && (
        <Link
          href={detailHref}
          scroll={false}
          className="inline-flex min-h-11 items-center justify-center rounded-full border px-5 text-[15px] font-semibold text-ink transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Otevřít kartu zákazníka
        </Link>
      )}
    </div>
  )
}

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn('rounded-chip border px-3 py-2.5', className)}>
      <dt className="font-num text-[11px] uppercase tracking-[0.08em] text-quiet">{label}</dt>
      <dd className="mt-0.5 font-num text-[15px] text-ink">{value}</dd>
    </div>
  )
}
