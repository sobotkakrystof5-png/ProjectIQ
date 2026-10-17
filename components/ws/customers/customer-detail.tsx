import Link from 'next/link'
import { Mail, Phone } from 'lucide-react'
import { LoyaltyCard, Money, SectionLabel, TimeRange } from '@/components/ws/brand'
import { formatPhone } from '@/components/ws/app/customer-summary'
import type { CustomerDetail as Detail } from '@/lib/ws/customers'
import type { LoyaltyEvent } from '@/lib/ws/loyalty'
import type { WsCurrency } from '@/lib/ws/money'
import { plural } from '@/lib/ws/plural'
import { formatDayShort, formatRelativeDay, pragueParts } from '@/lib/ws/time'
import { ConsentSwitch, CustomerEditForm, EndCustomer, EraseCustomer, LoyaltyControls, MergeBox } from './customer-controls'
import { SegmentBadge } from './segment-badge'

const STATUS: Record<string, string> = {
  completed: 'Hotovo',
  confirmed: 'Proběhlo',
  no_show: 'Neproběhlo',
  cancelled: 'Zrušeno',
}

const EVENT_TEXT: Record<string, string> = {
  stamp: 'Razítko za návštěvu',
  manual: 'Ručně',
  redeem: 'Uplatněná odměna',
  expire: 'Vypršela platnost',
}

/** „každý den“, „každé 2 dny“, „každých 5 dní“. */
function every(n: number, forms: readonly [string, string, string]): string {
  if (n === 1) return `každý ${forms[0]}`
  if (n >= 2 && n <= 4) return `každé ${n} ${forms[1]}`
  return `každých ${n} ${forms[2]}`
}

/** Obvyklý interval mezi návštěvami lidsky: „zhruba každé 4 týdny“. */
export function intervalText(days: number): string {
  if (days < 14) return every(days, ['den', 'dny', 'dní'])
  if (days < 63) return `zhruba ${every(Math.round(days / 7), ['týden', 'týdny', 'týdnů'])}`
  if (days < 540) return `zhruba ${every(Math.round(days / 30), ['měsíc', 'měsíce', 'měsíců'])}`
  return `zhruba ${every(Math.round(days / 365), ['rok', 'roky', 'let'])}`
}

/**
 * Celá karta zákazníka v pravém panelu (S12): skupina, kontakt, návštěvy,
 * útrata, věrnostní karta s ručním razítkem, historie, poznámka, souhlas,
 * sloučení duplicit a ukončení spolupráce.
 */
export function CustomerDetail({
  slug,
  customer: c,
  events,
  today,
  businessName,
  termHref,
}: {
  slug: string
  customer: Detail
  events: LoyaltyEvent[]
  today: string
  businessName: string
  termHref: (appointmentId: string) => string
}) {
  const day = (d: Date) => formatRelativeDay(pragueParts(d).date, today)
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="min-w-0 text-xl font-semibold tracking-[-0.02em]">{c.name}</h3>
          <SegmentBadge segment={c.segment} />
        </div>
        <ul className="flex flex-col gap-0.5 text-[15px]">
          {c.phone && (
            <li>
              <a href={`tel:${c.phone}`} className="inline-flex min-h-9 items-center gap-2 text-ink underline-offset-4 hover:underline">
                <Phone aria-hidden size={16} strokeWidth={1.5} className="text-quiet" />
                <span className="font-num text-sm">{formatPhone(c.phone)}</span>
              </a>
            </li>
          )}
          {c.email && (
            <li>
              <a href={`mailto:${c.email}`} className="inline-flex min-h-9 max-w-full items-center gap-2 text-ink underline-offset-4 hover:underline">
                <Mail aria-hidden size={16} strokeWidth={1.5} className="shrink-0 text-quiet" />
                <span className="truncate">{c.email}</span>
              </a>
            </li>
          )}
        </ul>
      </div>

      <dl className="grid grid-cols-2 gap-3">
        <Stat label="Návštěvy za rok">{plural(c.visits, ['návštěva', 'návštěvy', 'návštěv'])}</Stat>
        <Stat label="Naposledy">{c.lastVisit ? day(c.lastVisit) : 'zatím ne'}</Stat>
        <Stat label="Chodí">{c.intervalDays ? intervalText(c.intervalDays) : '—'}</Stat>
        <Stat label="Útrata">
          {c.spend.length === 0 ? (
            '—'
          ) : (
            <span className="flex flex-col">
              {c.spend.map((s) => (
                <Money key={s.currency} amount={s.amount} currency={s.currency as WsCurrency} />
              ))}
            </span>
          )}
        </Stat>
        <div className="col-span-2 rounded-chip border px-3 py-2.5">
          <dt className="font-num text-[11px] uppercase tracking-[0.08em] text-quiet">Příští termín</dt>
          <dd className="mt-0.5 text-[15px]">
            {c.nextVisit ? (
              <Link href={termHref(c.nextVisit.id)} scroll={false} className="underline-offset-4 hover:underline">
                <span className="font-num">{day(c.nextVisit.start)}, </span>
                <TimeRange start={c.nextVisit.start} end={c.nextVisit.end} />
                {c.nextVisit.service && <span className="text-quiet"> · {c.nextVisit.service}</span>}
              </Link>
            ) : (
              <span className="text-quiet">Žádný domluvený</span>
            )}
          </dd>
        </div>
      </dl>

      {c.loyalty && (
        <section aria-labelledby={`karta-${c.id}`} className="flex flex-col gap-3">
          <h4 id={`karta-${c.id}`}>
            <SectionLabel>Věrnostní karta</SectionLabel>
          </h4>
          <LoyaltyCard
            customer={c.name}
            business={businessName}
            stamps={c.loyalty.stamps}
            total={c.loyalty.needed}
            reward={c.loyalty.reward || 'odměna podle nastavení'}
          />
          <LoyaltyControls slug={slug} customerId={c.id} full={c.loyalty.full} />
          {events.length > 0 && (
            <ul className="flex flex-col gap-1 text-sm">
              {events.slice(0, 6).map((e) => (
                <li key={e.id} className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-ink">
                    {EVENT_TEXT[e.kind] ?? 'Změna'}
                    {e.reason && <span className="text-quiet"> · {e.reason}</span>}
                  </span>
                  <span className="shrink-0 font-num text-xs text-quiet">
                    {e.delta > 0 ? `+${e.delta}` : e.delta} · {formatDayShort(pragueParts(e.created_at).date)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section aria-labelledby={`historie-${c.id}`} className="flex flex-col gap-3">
        <h4 id={`historie-${c.id}`}>
          <SectionLabel>Historie</SectionLabel>
        </h4>
        {c.history.length === 0 ? (
          <p className="text-sm text-quiet">Zatím žádná návštěva ani zakázka.</p>
        ) : (
          <ul className="divide-y rounded-chip border">
            {c.history.map((h) => (
              <li key={`${h.kind}:${h.id}`} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate text-[15px] text-ink">{h.title}</span>
                  <span className="block font-num text-xs text-quiet">
                    {formatDayShort(pragueParts(h.at).date)} · {h.kind === 'job' ? h.status || 'Zakázka' : (STATUS[h.status] ?? h.status)}
                  </span>
                </span>
                {h.paid !== null && <Money amount={h.paid} currency={h.currency as WsCurrency} className="shrink-0 text-sm" />}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby={`udaje-${c.id}`} className="flex flex-col gap-3 border-t pt-5">
        <h4 id={`udaje-${c.id}`}>
          <SectionLabel>Údaje a poznámka</SectionLabel>
        </h4>
        <CustomerEditForm
          slug={slug}
          customer={{ id: c.id, name: c.name, phone: c.phone, email: c.email, birthday: c.birthday, note: c.note }}
        />
        <ConsentSwitch slug={slug} customerId={c.id} consent={c.consent} unsubscribed={c.unsubscribed} />
      </section>

      <section aria-labelledby={`slouceni-nadpis-${c.id}`} className="flex flex-col gap-3 border-t pt-5">
        <h4 id={`slouceni-nadpis-${c.id}`}>
          <SectionLabel>Stejný zákazník dvakrát?</SectionLabel>
        </h4>
        {c.duplicates.length > 0 && (
          <p className="text-sm text-quiet">
            Stejné jméno má {plural(c.duplicates.length, ['další zákazník', 'další zákazníci', 'dalších zákazníků'])}. Jestli jde o téhož člověka, slučte je.
          </p>
        )}
        <MergeBox
          slug={slug}
          customerId={c.id}
          customerName={c.name}
          suggested={c.duplicates.map((d) => ({ id: d.id, name: d.name, contact: d.phone ? formatPhone(d.phone) : d.email }))}
        />
      </section>

      <section className="border-t pt-5">
        <EndCustomer slug={slug} customerId={c.id} ended={c.ended} reason={c.endedReason} />
      </section>

      <section className="border-t pt-5">
        <EraseCustomer slug={slug} customerId={c.id} customerName={c.name} />
      </section>
    </div>
  )
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-chip border px-3 py-2.5">
      <dt className="font-num text-[11px] uppercase tracking-[0.08em] text-quiet">{label}</dt>
      <dd className="mt-0.5 font-num text-[15px] text-ink">{children}</dd>
    </div>
  )
}
