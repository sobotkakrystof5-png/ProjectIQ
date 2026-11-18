import Link from 'next/link'
import { ExternalLink, Video } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardHead, SECTION_LABEL } from '@/components/admin/card'
import { ContactActions } from '@/components/admin/contact-actions'
import { OutreachLeadActions } from '@/components/admin/outreach-lead-actions'
import type { MeetingReadiness } from '@/components/admin/schedule-meeting-dialog'
import { CallCard } from '@/components/admin/ai-asistent/call-card'
import {
  buildTimeline,
  czk,
  durationLabel,
  emailKindLabel,
  statusLabel,
  toQueueRow,
  type EmailView,
} from '@/lib/admin/outreach-crm-view'
import { CLOSED_STATUSES, formatWhen, queueReason } from '@/lib/admin/outreach-view'
import type { ContactScreen } from '@/lib/admin/outreach-crm'
import { adminDemoHref } from '@/lib/admin/outreach-demo'
import { cn } from '@/lib/utils'

/**
 * Detail klienta z Growth OS (R-120): všechno na jednom místě — co dál,
 * ukázka, všechny hovory (shrnutí, přepis, co asistent zjistil), e-maily od robota
 * a časová osa. Údaje patří Growth OS (D1 je pravda o tom, komu robot volá);
 * tady se jen čtou a Kryštof s firmou jedná.
 */

const ANGLE: Record<string, string> = {
  penize: 'Přichází o peníze',
  cas: 'Ztrácí čas',
  lide: 'Lidé ho nenajdou',
  bez_webu: 'Nemá web',
}

const DEMO_STATUS: Record<string, string> = {
  queued: 'Čeká na stavbu',
  building: 'Staví se',
  ready: 'Hotová',
  failed: 'Stavba se nepovedla',
}

function ExternalA({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn('inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-navy-700 underline-offset-4 hover:underline', className)}
    >
      {children}
      <ExternalLink size={14} strokeWidth={1.5} aria-hidden="true" />
    </a>
  )
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-quiet">{label}</dt>
      <dd className="min-w-0 text-right text-ink">{value}</dd>
    </div>
  )
}

export function ContactDetailView({
  data,
  nowIso,
  meeting,
}: {
  data: ContactScreen
  nowIso: string
  meeting: MeetingReadiness
}) {
  const now = new Date(nowIso)
  const { lead, calls, emails } = data
  const row = toQueueRow(lead)
  const reason = queueReason(row, now)
  const closed = lead.doNotCall || (CLOSED_STATUSES as readonly string[]).includes(lead.status)
  const timeline = buildTimeline(lead, calls, emails, now)
  const totalCost = calls.reduce<number | null>((sum, c) => (c.costCzk === null ? sum : (sum ?? 0) + c.costCzk), null)
  const talked = calls.reduce((sum, c) => sum + (c.durationS ?? 0), 0)

  return (
    <div className="flex flex-col gap-6">
      {/* Co dál — jedna hlavní akce obrazovky. */}
      <Card>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            {lead.handledReason === 'prevzato' ? (
              <Badge variant="strong">Převzatý do Hovorů</Badge>
            ) : lead.handledReason === 'nezajem' ? (
              <Badge variant="neutral">Odložený: nemá zájem</Badge>
            ) : closed ? (
              <Badge variant="neutral">{statusLabel(lead.status)}</Badge>
            ) : (
              <Badge variant={reason.urgent ? 'signal' : 'neutral'}>{reason.label}</Badge>
            )}
            <span className="text-xs text-quiet">Stav v Growth OS: {statusLabel(lead.status)}</span>
          </div>

          {lead.callbackText && (
            <p className="text-sm text-ink">
              Kdy chce zavolat (jeho slovy): „{lead.callbackText}"
              {lead.callbackAt ? <span className="text-quiet"> · {formatWhen(lead.callbackAt, now)}</span> : null}
            </p>
          )}

          {data.meeting && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-chip bg-navy-50 px-3 py-2 text-sm text-ink">
              <span>
                Schůzka <span className="font-medium">{formatWhen(data.meeting.startsAt, now)}</span>
                {data.meeting.inviteStatus === 'sent' ? ' · pozvánka odešla' : data.meeting.inviteStatus === 'failed' ? ' · pozvánka neodešla' : ''}
              </span>
              {data.meeting.meetUrl && (
                <a
                  href={data.meeting.meetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center gap-1.5 font-medium text-navy-700 underline-offset-4 hover:underline"
                >
                  <Video size={16} strokeWidth={1.5} aria-hidden="true" />
                  Připojit se
                </a>
              )}
            </div>
          )}

          {lead.handledAt ? (
            <div className="flex flex-wrap items-center gap-3 text-sm text-quiet">
              <span>
                {lead.handledReason === 'prevzato' ? 'Převzal jste ho' : 'Odložil jste ho'} {formatWhen(lead.handledAt, now)}. Asistent mu už nevolá.
              </span>
              {lead.clientLeadId && (
                <Link
                  href={`/dashboard/calls?lead=${lead.clientLeadId}`}
                  className="inline-flex min-h-11 items-center font-medium text-navy-700 underline-offset-4 hover:underline"
                >
                  Otevřít v Hovorech
                </Link>
              )}
            </div>
          ) : closed ? (
            <p className="text-sm text-quiet">S touhle firmou už asistent skončil. Kdyby se ozvala, vrátí se do fronty sama.</p>
          ) : (
            <OutreachLeadActions row={row} nowIso={nowIso} meeting={meeting} />
          )}
        </div>
      </Card>

      {/* Telefon: kontakt a ukázka, pak hovory a e-maily, doplňky nakonec.
          Počítač: hovory vlevo přes oba řádky, kontakt, ukázka a doplňky vpravo. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:grid-rows-[auto_1fr]">
        <aside aria-label="Kontakt a ukázka" className="flex flex-col gap-6 lg:col-start-2 lg:row-start-1 lg:self-start">
          <Card>
            <CardHead title="Kontakt" />
            <ContactActions phone={lead.phone} email={lead.email} context={{ projectName: lead.company }} emptyHint="Growth OS neposlal telefon ani e-mail." />
            <dl className="mt-4 flex flex-col gap-2 text-sm">
              {lead.contactName && <Fact label="Jméno" value={lead.contactName} />}
              {lead.phone && <Fact label="Telefon" value={<span className="font-num">{lead.phone}</span>} />}
              {lead.email && <Fact label="E-mail" value={<span className="break-all">{lead.email}</span>} />}
              {lead.industry && <Fact label="Obor" value={lead.industry} />}
              {lead.city && <Fact label="Město" value={lead.city} />}
            </dl>
            {lead.website && <ExternalA href={lead.website} className="mt-2">Jeho současný web</ExternalA>}
          </Card>

          <Card id="ukazka" className="scroll-mt-24">
            <CardHead title="Ukázka" />
            {lead.demoUrl ? (
              <div className="flex flex-col gap-3">
                {lead.demoPreviewUrl && (
                  <a href={adminDemoHref(lead.demoUrl)} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-chip border border-navy-100">
                    {/* Obrázek jde přes náš server (CSP img-src 'self'), jen z navrhy.vizeon.cz. */}
                    <img
                      src={`/api/outreach/leads/${lead.id}/nahled`}
                      alt={`Náhled ukázky webu pro ${lead.company}`}
                      loading="lazy"
                      className="aspect-[4/3] w-full object-cover object-top"
                    />
                  </a>
                )}
                <ExternalA href={adminDemoHref(lead.demoUrl)}>Otevřít ukázku</ExternalA>
                <dl className="flex flex-col gap-2 text-sm">
                  {lead.demoStatus && <Fact label="Stav" value={DEMO_STATUS[lead.demoStatus] ?? lead.demoStatus} />}
                  {lead.demoBuiltAt && <Fact label="Hotová" value={formatWhen(lead.demoBuiltAt, now)} />}
                  {lead.demoEmailSentAt && <Fact label="Odeslaná" value={formatWhen(lead.demoEmailSentAt, now)} />}
                  <Fact
                    label="Otevřel"
                    value={
                      lead.demoViews > 0
                        ? `${lead.demoViews}×${lead.demoFirstViewedAt ? `, poprvé ${formatWhen(lead.demoFirstViewedAt, now)}` : ''}`
                        : lead.snapshotVersion >= 2
                          ? 'zatím ne'
                          : 'zatím se neměří'
                    }
                  />
                  {lead.demoLastViewedAt && lead.demoViews > 1 && <Fact label="Naposledy" value={formatWhen(lead.demoLastViewedAt, now)} />}
                  {lead.demoMaxViewS ? <Fact label="Nejdéle" value={durationLabel(lead.demoMaxViewS)} /> : null}
                </dl>
                <p className="text-xs text-quiet">Když ukázku otevřete odsud, jako otevření klientem se nepočítá.</p>
              </div>
            ) : (
              <p className="text-sm text-quiet">
                {['accepted', 'demo_building'].includes(lead.status) ? 'Ukázka se připravuje.' : 'Ukázku zatím nedostal.'}
              </p>
            )}
          </Card>

        </aside>

        <div className="flex min-w-0 flex-col gap-6 lg:col-start-1 lg:row-span-2 lg:row-start-1">
          <section aria-labelledby="hovory" className="flex flex-col gap-2">
            <h2 id="hovory" className={SECTION_LABEL}>
              Hovory ({calls.length})
            </h2>
            {calls.length === 0 ? (
              lead.callSummary ? (
                <Card>
                  <h3 className={SECTION_LABEL}>Shrnutí posledního hovoru</h3>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{lead.callSummary}</p>
                  <p className="mt-1 text-xs text-quiet">
                    Shrnul to AI asistent, nemusí být přesné. Celé hovory s přepisem se ukážou, až je Growth OS začne posílat.
                  </p>
                </Card>
              ) : (
                <p className="text-sm text-quiet">Hovory se ukážou, až je Growth OS pošle.</p>
              )
            ) : (
              <ul className="flex flex-col gap-2">
                {calls.map((c, i) => (
                  <CallCard
                    key={c.rowId}
                    call={c}
                    showDate
                    defaultOpen={i === 0}
                  />
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="emaily" className="flex flex-col gap-2">
            <h2 id="emaily" className={SECTION_LABEL}>
              E-maily od asistenta ({emails.length})
            </h2>
            {emails.length === 0 ? (
              <p className="text-sm text-quiet">
                {lead.demoEmailSentAt || lead.coldEmailSentAt
                  ? 'E-maily odešly, ale jejich text Growth OS zatím neposílá.'
                  : 'Zatím mu nic neodešlo.'}
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {emails.map((e) => (
                  <EmailCard key={e.id} email={e} now={now} />
                ))}
              </ul>
            )}
          </section>

          <Card>
            <CardHead title="Časová osa" hint="Všechno, co se s firmou stalo, od nejnovějšího." />
            {timeline.length === 0 ? (
              <p className="text-sm text-quiet">Zatím se nic nestalo.</p>
            ) : (
              <ol className="flex flex-col">
                {timeline.map((t, i) => (
                  <li key={`${t.at}-${i}`} className="grid grid-cols-[6.5rem_1fr] gap-3 border-t border-navy-100 py-2 first:border-t-0 first:pt-0">
                    <span className={cn('font-num text-xs', t.future ? 'text-navy-700' : 'text-quiet')}>{formatWhen(t.at, now)}</span>
                    <span className="min-w-0 text-sm">
                      {t.anchor ? (
                        <a href={`#${t.anchor}`} className={cn('font-medium underline-offset-4 hover:underline', t.tone === 'danger' ? 'text-danger' : 'text-ink')}>
                          {t.title}
                        </a>
                      ) : (
                        <span className={cn('font-medium', t.tone === 'danger' ? 'text-danger' : 'text-ink')}>{t.title}</span>
                      )}
                      {t.future && <span className="ml-2 text-xs text-quiet">naplánováno</span>}
                      {t.detail && <span className="block truncate text-xs text-quiet">{t.detail}</span>}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
        <aside aria-label="Doplňky" className="flex flex-col gap-6 lg:col-start-2 lg:row-start-2 lg:self-start">
          {lead.research && (lead.research.hook || lead.research.findings.length > 0) && (
            <Card>
              <CardHead title="Proč jsme ho oslovili" hint="Z rešerše jeho webu před úvodním e-mailem." />
              {lead.research.angle && <p className="text-sm font-medium text-ink">{ANGLE[lead.research.angle] ?? lead.research.angle}</p>}
              {lead.research.hook && <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{lead.research.hook}</p>}
              {lead.research.findings.length > 0 && (
                <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm text-ink">
                  {lead.research.findings.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          <Card>
            <CardHead title="Asistent" />
            <dl className="flex flex-col gap-2 text-sm">
              <Fact label="Pokusů o hovor" value={<span className="font-num">{lead.attempts}</span>} />
              {talked > 0 && <Fact label="Mluvili celkem" value={durationLabel(talked)} />}
              {totalCost !== null && <Fact label="Hovory stály" value={<span className="font-num">{czk(totalCost)}</span>} />}
              {lead.nextCallAfter && !lead.handledAt && !closed && <Fact label="Zavolá znovu" value={formatWhen(lead.nextCallAfter, now)} />}
              {lead.segment && <Fact label="Skupina" value={lead.segment} />}
              {lead.sourceBatch && <Fact label="Seznam" value={lead.sourceBatch} />}
              <Fact label="Data z Growth OS" value={formatWhen(lead.updatedAt, now)} />
            </dl>
          </Card>
        </aside>

      </div>
    </div>
  )
}

function EmailCard({ email: e, now }: { email: EmailView; now: Date }) {
  const states = [
    e.bouncedAt ? { label: 'Nedoručeno', variant: 'danger' as const } : null,
    e.repliedAt ? { label: 'Odpověděl', variant: 'signal' as const } : null,
    e.clickedAt ? { label: e.clickCount > 1 ? `Klikl ${e.clickCount}×` : 'Klikl', variant: 'signal' as const } : null,
    e.openedAt ? { label: e.openCount > 1 ? `Otevřel ${e.openCount}×` : 'Otevřel', variant: 'confirmed' as const } : null,
    !e.openedAt && !e.bouncedAt && e.deliveredAt ? { label: 'Doručeno', variant: 'neutral' as const } : null,
    !e.sentAt && e.scheduledFor ? { label: 'Naplánovaný', variant: 'neutral' as const } : null,
  ].filter((s): s is { label: string; variant: 'danger' | 'signal' | 'confirmed' | 'neutral' } => s !== null)
  const when = e.sentAt ?? e.scheduledFor

  const head = (
    <span className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
      <span className="w-24 shrink-0 font-num text-xs text-quiet">{when ? formatWhen(when, now) : ''}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ink">{e.subject ?? emailKindLabel(e.kind)}</span>
        <span className="block truncate text-xs text-quiet">{emailKindLabel(e.kind)}</span>
      </span>
      <span className="flex basis-full flex-wrap gap-1 pl-[6.75rem] sm:basis-auto sm:pl-0">
        {states.map((s) => (
          <Badge key={s.label} variant={s.variant}>
            {s.label}
          </Badge>
        ))}
      </span>
    </span>
  )

  return (
    <li id={`email-${e.id}`} className="scroll-mt-24 rounded-box border border-navy-100 bg-surface">
      {e.bodyText ? (
        <details>
          <summary className="cursor-pointer list-none rounded-box transition-colors hover:bg-navy-50 [&::-webkit-details-marker]:hidden">{head}</summary>
          <div className="border-t border-navy-100 px-4 py-4">
            <p className="whitespace-pre-wrap text-sm text-ink">{e.bodyText}</p>
          </div>
        </details>
      ) : (
        head
      )}
    </li>
  )
}
