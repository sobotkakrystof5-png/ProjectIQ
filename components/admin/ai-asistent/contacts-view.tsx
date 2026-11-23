import Link from 'next/link'
import { ChevronRight, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { PillNav } from '@/components/ws/app/toolbar'
import { OutreachQueue } from '@/components/admin/outreach-queue'
import { ArrangedMeetingButton } from '@/components/admin/arranged-meeting'
import type { MeetingReadiness } from '@/components/admin/schedule-meeting-dialog'
import { CONTACT_FILTERS, statusLabel, type ContactFilter, type ContactRow } from '@/lib/admin/outreach-crm-view'
import { formatWhen } from '@/lib/admin/outreach-view'
import type { ContactsScreen } from '@/lib/admin/outreach-crm'

/**
 * AI asistent › Kontakty (R-120): všechny firmy z Growth OS. „Na tahu" je
 * fronta s akcemi (R-112), ostatní filtry seznam s odkazem na detail
 * a „Schůzka domluvena" na konci řádku (dokud firma budoucí schůzku nemá).
 * Filtr i hledání jsou v adrese — obyčejný formulář GET, funguje bez JS.
 */

const PATH = '/dashboard/ai-asistent'

function href(filter: ContactFilter, q?: string): string {
  const p = new URLSearchParams({ pohled: 'kontakty' })
  if (filter !== 'na-tahu') p.set('filtr', filter)
  if (q) p.set('q', q)
  return `${PATH}?${p.toString()}`
}

/** Má firma schůzku, která ještě nebyla? */
function upcomingMeeting(row: ContactRow, now: Date): boolean {
  return row.meetingAt !== null && Date.parse(row.meetingAt) > now.getTime()
}

/** Jedna věta, co se s firmou naposledy stalo. Budoucí schůzka má přednost. */
function lastStep(row: ContactRow, now: Date): string {
  if (row.meetingAt && upcomingMeeting(row, now)) return `Schůzka ${formatWhen(row.meetingAt, now)}`
  if (row.emailRepliedAt) return `Odpověděl na e-mail ${formatWhen(row.emailRepliedAt, now)}`
  if (row.meetingAt) return `Schůzka ${formatWhen(row.meetingAt, now)}`
  if (row.demoViews > 0) return row.demoViews === 1 ? 'Otevřel ukázku' : `Otevřel ukázku ${row.demoViews}×`
  if (row.emailOpenedAt) return `Otevřel e-mail ${formatWhen(row.emailOpenedAt, now)}`
  if (row.demoEmailSentAt) return `Ukázka odeslaná ${formatWhen(row.demoEmailSentAt, now)}`
  if (row.lastCallAt) return `Poslední hovor ${formatWhen(row.lastCallAt, now)}`
  return statusLabel(row.status)
}

export function ContactsView({
  data,
  filter,
  q,
  nowIso,
  meeting,
}: {
  data: ContactsScreen
  filter: ContactFilter
  q: string
  nowIso: string
  meeting: MeetingReadiness
}) {
  const now = new Date(nowIso)
  return (
    <div className="flex flex-col gap-4">
      <form action={PATH} method="get" role="search" className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="pohled" value="kontakty" />
        {filter !== 'na-tahu' && <input type="hidden" name="filtr" value={filter} />}
        <label className="relative min-w-0 flex-1 sm:max-w-sm">
          <span className="sr-only">Hledat firmu</span>
          <Search size={16} strokeWidth={1.5} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-quiet" />
          <input
            type="search"
            name="q"
            defaultValue={q}
            maxLength={80}
            placeholder="Firma, jméno, telefon, e-mail, město"
            className="min-h-11 w-full rounded-chip border border-navy-100 bg-surface pl-9 pr-3 text-sm text-ink placeholder:text-quiet focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-700"
          />
        </label>
        {q && (
          <Link href={href(filter)} className="inline-flex min-h-11 items-center px-2 text-sm font-medium text-navy-700 underline-offset-4 hover:underline">
            Zrušit hledání
          </Link>
        )}
      </form>

      <PillNav
        label="Které firmy"
        items={CONTACT_FILTERS.map((f) => ({
          key: f.key,
          label: f.label,
          href: href(f.key, q),
          active: f.key === filter,
          count: data.counts[f.key],
        }))}
      />

      {data.queue ? (
        <OutreachQueue rows={data.queue} nowIso={nowIso} meeting={meeting} />
      ) : data.rows.length === 0 ? (
        <div className="rounded-box border border-navy-100 bg-surface px-5 py-8 text-center">
          <p className="text-sm font-semibold text-ink">{q ? 'Nic takového jsme nenašli.' : 'Tady zatím nikdo není.'}</p>
          <p className="mt-1 text-sm text-quiet">
            {q ? 'Zkuste kratší text nebo jiný filtr.' : 'Firmy se tu objeví, jakmile je Growth OS pošle.'}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-navy-100 overflow-hidden rounded-box border border-navy-100 bg-surface">
          {data.rows.map((row) => (
            <li key={row.id} className="flex items-stretch">
              <Link
                href={`/dashboard/ai-asistent/kontakt/${row.id}`}
                className="flex min-h-11 min-w-0 flex-1 items-center gap-3 px-4 py-3 transition-colors hover:bg-navy-50"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">{row.company}</span>
                  <span className="block truncate text-xs text-quiet">
                    {[row.contactName, row.industry, row.city].filter(Boolean).join(' · ') || 'Bez dalších údajů'}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-ink sm:hidden">{lastStep(row, now)}</span>
                </span>
                <span className="hidden min-w-0 max-w-[16rem] shrink text-right text-xs text-ink sm:block">{lastStep(row, now)}</span>
                <Badge
                  variant={row.handledReason === 'prevzato' ? 'strong' : row.status === 'won' ? 'strong' : 'neutral'}
                  className="hidden shrink-0 md:inline-flex"
                >
                  {row.handledReason === 'prevzato'
                    ? 'Převzatý'
                    : row.handledReason === 'nezajem'
                      ? 'Nemá zájem'
                      : statusLabel(row.status)}
                </Badge>
                <ChevronRight size={16} strokeWidth={1.5} aria-hidden="true" className="shrink-0 text-quiet" />
              </Link>
              {!upcomingMeeting(row, now) && (
                <ArrangedMeetingButton
                  firm={{ id: row.id, company: row.company, callbackAt: row.callbackAt }}
                  nowIso={nowIso}
                  appearance="row"
                />
              )}
            </li>
          ))}
        </ul>
      )}
      {!data.queue && data.rows.length >= 200 && (
        <p className="text-xs text-quiet">Ukazuje se 200 naposledy změněných. Zbytek najdete hledáním.</p>
      )}
    </div>
  )
}
