import { Suspense } from 'react'
import Link from 'next/link'
import type { WsBusiness, WsContext } from '@/lib/ws/context'
import { getAppointmentDetail, getBookingOptions, getCustomerOption } from '@/lib/ws/calendar'
import { detailValue, hrefWith, parseDetail, type DetailRef } from '@/lib/ws/detail-param'
import { WS_FEATURES } from '@/lib/ws/features'
import { getCustomerCard, getEnabledModules, getRequestDetail } from '@/lib/ws/today'
import { formatDayShort, formatMinutes, formatRelativeDay, formatTimeRange, isIsoDate, pragueParts, pragueToUtc } from '@/lib/ws/time'
import { navHref } from '@/lib/ws/nav'
import { ConfirmedBlock, NewRequestBlock, TimeRange } from '@/components/ws/brand'
import { AppointmentActions } from './booking/appointment-actions'
import { BlockForm } from './booking/block-form'
import { BookingForm } from './booking/booking-form'
import { FindSlotForm } from './booking/find-slot-form'
import { AdviceTip } from './booking/slot-advice-view'
import { ReopenRequestButton, RequestActions } from './booking/request-actions'
import { CustomerSummary, formatPhone } from './customer-summary'
import { CustomerDetail } from '@/components/ws/customers/customer-detail'
import { MessageDraftForm } from '@/components/ws/customers/message-draft-form'
import { VisitPayment } from '@/components/ws/customers/visit-payment'
import { orderPageUrl, portalPageUrl } from '@/lib/ws/app-origin'
import { getAppointmentPortal, getJobDetail } from '@/lib/ws/jobs'
import { CopyPortalLink, JobResultForm, JobUpdates } from './jobs/job-portal'
import { JobStageControl } from './jobs/job-stage-control'
import { JobHistory, JobSummary } from './jobs/job-summary'
import { getCustomerDetail } from '@/lib/ws/customers'
import { loadIntakeConfig, loadSlots } from '@/lib/ws/intake/intake'
import { getLoyaltyEvents, getLoyaltyProgram, getVisitPayment } from '@/lib/ws/loyalty'
import { draftMessage, getContactableCustomer, pickSlotSuggestions } from '@/lib/ws/outreach'
import { InvoiceForm } from '@/components/ws/money/invoice-form'
import { getInvoiceOptions } from '@/lib/ws/money/data'
import { DetailSheet } from './detail-sheet'
import { getSlotAdvice } from '@/lib/ws/slot-advice'
import { toAdviceDto } from '@/lib/ws/slot-suggest'

type Params = Record<string, string | string[] | undefined>

const SOURCE_LABELS: Record<string, string> = {
  web: 'z webu',
  widget: 'z webu',
  page: 'z objednávací stránky',
  eshop: 'z e-shopu',
  phone: 'telefonem',
  manual: 'zapsaná ručně',
}

const STATUS_TEXT: Record<string, string> = {
  confirmed: 'Potvrzená poptávka.',
  rescheduled: 'Potvrzená na jiný čas.',
  declined: 'Odmítnutá poptávka.',
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

/** Parametry, které nese jen otevřený formulář — zavřením panelu zmizí. */
const FORM_PARAMS = { kdo: null, den: null, cas: null, sluzba: null, pracovnik: null } as const

/** Formuláře, které ještě neumí uložit, se neotevřou ani ze sdíleného odkazu (R-043). */
function isAvailable(ref: DetailRef, modules: Set<string>): boolean {
  if (ref.kind === 'nova-rezervace' || ref.kind === 'nova-blokace' || ref.kind === 'najit-cas') return WS_FEATURES.newBooking && modules.has('calendar')
  if (ref.kind === 'nova-faktura') return WS_FEATURES.newInvoice && modules.has('invoices')
  return true
}

type DetailSlotProps = {
  ctx: WsContext
  business: WsBusiness
  pathname: string
  searchParams: Params
  today: string
}

/**
 * Pravý panel podle `?detail=` na kterékoli obrazovce byznysu. Data se čtou
 * na serveru přes kontext účtu; cizí nebo smazaný záznam = „není tu".
 * Vlastní `Suspense` (RD02): panel se dočítá sám a stránka pod ním na něj
 * nikdy nečeká. Dokud nepřijde, nic se neukazuje — hotový panel se tak
 * neotevírá dvakrát.
 */
export function DetailSlot(props: DetailSlotProps) {
  return (
    <Suspense fallback={null}>
      <DetailContent {...props} />
    </Suspense>
  )
}

async function DetailContent({
  ctx,
  business,
  pathname,
  searchParams,
  today,
}: DetailSlotProps) {
  const ref = parseDetail(searchParams.detail)
  if (!ref) return null
  const modules = await getEnabledModules(ctx, business)
  if (!isAvailable(ref, modules)) return null
  const closeHref = hrefWith(pathname, searchParams, { detail: null, ...FORM_PARAMS })
  const key = detailValue(ref)
  const panel = await panelContent(ctx, business, ref, { pathname, searchParams, today, closeHref, modules })
  return (
    <DetailSheet key={key} title={panel.title} description={panel.description} closeHref={closeHref}>
      {panel.body}
    </DetailSheet>
  )
}

type Env = { pathname: string; searchParams: Params; today: string; closeHref: string; modules: Set<string> }

async function panelContent(
  ctx: WsContext,
  business: WsBusiness,
  ref: DetailRef,
  env: Env,
): Promise<{ title: string; description?: string; body: React.ReactNode }> {
  const customerLink = (id: string) => hrefWith(env.pathname, env.searchParams, { detail: `zakaznik:${id}`, ...FORM_PARAMS })

  switch (ref.kind) {
    case 'zakaznik': {
      const [customer, events] = await Promise.all([
        getCustomerDetail(ctx, business, ref.id),
        getLoyaltyEvents(ctx, business, ref.id),
      ])
      if (!customer) return notHere('Zákazník', env.closeHref)
      return {
        title: 'Zákazník',
        body: (
          <CustomerDetail
            slug={business.slug}
            customer={customer}
            events={events}
            today={env.today}
            businessName={business.name}
            invoiceHref={env.modules.has('invoices')?navHref(business.slug,'faktury')+'?detail=nova-faktura&zakaznik='+customer.id:null}
            termHref={(id) => hrefWith(env.pathname, env.searchParams, { detail: `termin:${id}`, ...FORM_PARAMS })}
          />
        ),
      }
    }

    case 'zprava': {
      const contact = await getContactableCustomer(ctx, ref.id)
      if (!contact) {
        return {
          title: 'Připravit zprávu',
          body: (
            <p className="text-[15px] text-quiet">
              Tomuhle zákazníkovi psát nemůžeme. Nemá souhlas s nabídkami nebo e-mail.
            </p>
          ),
        }
      }
      const program = await getLoyaltyProgram(ctx, business)
      let slots: Date[] = []
      if (ref.topic === 'winback') {
        const config = await loadIntakeConfig(ctx.accountId, business.id)
        if (config) slots = pickSlotSuggestions(await loadSlots(ctx.accountId, config, null), 3, pragueToUtc)
      }
      const initial = draftMessage(ref.topic, {
        businessName: business.name,
        reward: program.enabled && program.rewardText ? program.rewardText : null,
        orderUrl: await orderPageUrl(business.slug),
        slots,
      })
      return {
        title: 'Připravit zprávu',
        description: contact.name,
        body: (
          <MessageDraftForm
            slug={business.slug}
            customerId={contact.customerId}
            topic={ref.topic}
            email={contact.email}
            initial={initial}
            closeHref={env.closeHref}
          />
        ),
      }
    }

    case 'poptavka': {
      const r = await getRequestDetail(ctx, business, ref.id)
      if (!r) return notHere('Poptávka', env.closeHref)
      const created = pragueParts(r.created_at)
      const calendar = env.modules.has('calendar')
      const isNew = r.status === 'new'
      const wantedEnd = r.wanted_start
        ? (r.wanted_end ?? new Date(r.wanted_start.getTime() + (r.duration_min ?? 60) * 60_000))
        : null
      const wantedMin = r.wanted_start && wantedEnd ? Math.max(5, Math.round((wantedEnd.getTime() - r.wanted_start.getTime()) / 60_000)) : null
      // Volno / kolize pro chtěný čas a tři nejbližší volné časy (RD05); bez času jen nejbližší volno.
      const [card, options, advice] = await Promise.all([
        r.customer_id ? getCustomerCard(ctx, business, r.customer_id) : null,
        isNew ? getBookingOptions(ctx, business) : null,
        isNew && calendar
          ? getSlotAdvice(ctx, business, {
              start: r.wanted_start,
              durationMin: wantedMin ?? (r.duration_min ?? null),
              serviceId: r.service_id,
              staffId: null,
              count: 3,
            })
              .then((a) => toAdviceDto(a, env.today))
              // Rada je doplněk: když selže, poptávku jde potvrdit i bez ní.
              .catch((e) => {
                console.error('slotAdvice.detail', { accountId: ctx.accountId, error: e instanceof Error ? e.message : 'unknown' })
                return null
              })
          : null,
      ])
      const wanted = r.wanted_start ? pragueParts(r.wanted_start) : null

      return {
        title: isNew ? 'Nová poptávka' : 'Poptávka',
        description: `Přišla ${SOURCE_LABELS[r.source] ?? ''} ${formatRelativeDay(created.date, env.today)} v ${formatMinutes(created.minutes)}`.replace(/\s+/g, ' '),
        body: (
          <div className="flex flex-col gap-5">
            {isNew ? (
              r.wanted_start ? (
                <NewRequestBlock
                  start={r.wanted_start}
                  end={wantedEnd ?? undefined}
                  day={formatRelativeDay(wanted!.date, env.today)}
                  customer={r.customer_name}
                  service={r.service_name ?? undefined}
                />
              ) : (
                <NewRequestBlock customer={r.customer_name} service={r.service_name ?? undefined} />
              )
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-[15px] text-quiet">{STATUS_TEXT[r.status] ?? 'Vyřízená poptávka.'}</p>
                {r.status === 'declined' && <ReopenRequestButton slug={business.slug} requestId={r.id} />}
              </div>
            )}

            {advice && <AdviceTip advice={advice} />}

            {isNew && options && (
              <RequestActions
                slug={business.slug}
                requestId={r.id}
                wanted={wanted ? { day: wanted.date, minutes: wanted.minutes } : null}
                calendar={calendar}
                jobs={env.modules.has('jobs')}
                staff={options.staff}
                today={env.today}
                advice={advice}
                serviceId={r.service_id}
                durationMin={wantedMin ?? r.duration_min ?? null}
                preferredStaffId={r.requested_staff_id}
                settingsHref={`${navHref(business.slug, 'nastaveni')}/oteviraci-doba`}
              />
            )}

            {r.customer_id&&env.modules.has('invoices')&&<Link href={navHref(business.slug,'faktury')+'?detail=nova-faktura&zakaznik='+r.customer_id} scroll={false} className="inline-flex min-h-11 items-center justify-center self-start rounded-full border px-5 text-sm font-semibold text-ink hover:bg-accent">Vystavit fakturu</Link>}

            <dl className="flex flex-col gap-3 text-[15px]">
              {!isNew && r.wanted_start && (
                <Row label="Chtěný termín">
                  <span className="font-num">{formatDayShort(wanted!.date)} </span>
                  <TimeRange start={r.wanted_start} end={r.wanted_end ?? undefined} />
                </Row>
              )}
              {r.requested_staff_id && (
                <Row label="Požadovaný pracovník">
                  {r.requested_staff_name ?? 'Už není dostupný'}
                </Row>
              )}
              {r.contact.phone && (
                <Row label="Telefon">
                  <a className="font-num underline-offset-4 hover:underline" href={`tel:${r.contact.phone}`}>
                    {formatPhone(r.contact.phone)}
                  </a>
                </Row>
              )}
              {r.contact.email && (
                <Row label="E-mail">
                  <a className="break-all underline-offset-4 hover:underline" href={`mailto:${r.contact.email}`}>
                    {r.contact.email}
                  </a>
                </Row>
              )}
              {r.fields.map((f) => (
                <Row key={f.label} label={f.label}>
                  <span className="whitespace-pre-line">{f.value}</span>
                </Row>
              ))}
              {r.message && (
                <Row label="Zpráva">
                  <span className="whitespace-pre-line">{r.message}</span>
                </Row>
              )}
            </dl>

            {card && (
              <section aria-label="Zákazník" className="border-t pt-5">
                <CustomerSummary card={card} today={env.today} businessName={business.name} detailHref={customerLink(card.id)} />
              </section>
            )}
          </div>
        ),
      }
    }

    case 'termin': {
      const a = await getAppointmentDetail(ctx, business, ref.id)
      if (!a) return notHere('Termín', env.closeHref)
      const [card, options, payment, portal] = await Promise.all([
        a.customer_id ? getCustomerCard(ctx, business, a.customer_id) : null,
        a.status === 'confirmed' ? getBookingOptions(ctx, business) : null,
        a.kind === 'visit' ? getVisitPayment(ctx, business, a.id) : null,
        a.kind === 'visit' && env.modules.has('portal') ? getAppointmentPortal(ctx, business, a.id) : null,
      ])
      const start = pragueParts(a.start)
      const block = a.kind === 'block'
      return {
        title: block ? 'Blokace' : 'Termín',
        description: `${formatRelativeDay(start.date, env.today)} ${formatTimeRange(a.start, a.end)}`,
        body: (
          <div className="flex flex-col gap-5">
            {block ? (
              <div className="rounded-chip bg-navy-50 p-3 text-quiet dark:bg-navy-900 dark:text-navy-200">
                <TimeRange start={a.start} end={a.end} className="text-xs" />
                <p className="mt-1 text-[15px] font-semibold text-ink">{a.title ?? 'Blokace'}</p>
                <p className="text-sm">{a.staff_name ?? 'Celý byznys'}</p>
              </div>
            ) : (
              <ConfirmedBlock start={a.start} end={a.end} customer={a.customer_name ?? a.title ?? 'Termín'} service={a.service_name ?? undefined} />
            )}
            {a.status === 'cancelled' && <p className="text-[15px] text-quiet">{block ? 'Zrušená blokace.' : 'Zrušený termín.'}</p>}

            {/* Zaplatit jde dnešní a proběhlý termín, ne budoucí. */}
            {payment && (payment.status !== 'confirmed' || start.date <= env.today) && (
              <VisitPayment slug={business.slug} appointmentId={a.id} state={payment} />
            )}

            {a.status === 'confirmed' && options && (
              <AppointmentActions
                slug={business.slug}
                appointmentId={a.id}
                kind={a.kind}
                at={{ day: start.date, minutes: start.minutes }}
                durationMin={Math.round((a.end.getTime() - a.start.getTime()) / 60_000)}
                staffId={a.staff_id}
                staff={options.staff}
                closeHref={env.closeHref}
              />
            )}

            {portal && a.status !== 'cancelled' && <CopyPortalLink url={await portalPageUrl(portal.publicToken)} />}

            <dl className="flex flex-col gap-3 text-[15px]">
              <Row label="Den">
                <span className="font-num">{formatDayShort(start.date)}</span>
              </Row>
              {portal?.review && (
                <Row label="Hodnocení">
                  <span className="font-num">{portal.review.score} / 10</span>
                  {portal.review.comment && <span className="mt-1 block whitespace-pre-line text-quiet">{portal.review.comment}</span>}
                </Row>
              )}
              {!block && a.staff_name && options && options.staff.length > 1 && <Row label="Kdo">{a.staff_name}</Row>}
              {a.note && (
                <Row label="Poznámka">
                  <span className="whitespace-pre-line">{a.note}</span>
                </Row>
              )}
              {a.request_id && (
                <Row label="Z poptávky">
                  <Link
                    href={hrefWith(env.pathname, env.searchParams, { detail: `poptavka:${a.request_id}`, ...FORM_PARAMS })}
                    scroll={false}
                    className="font-semibold text-navy-700 underline-offset-4 hover:underline dark:text-navy-200"
                  >
                    Otevřít poptávku
                  </Link>
                </Row>
              )}
            </dl>

            {card && (
              <section aria-label="Zákazník" className="border-t pt-5">
                <CustomerSummary card={card} today={env.today} businessName={business.name} detailHref={customerLink(card.id)} />
              </section>
            )}
          </div>
        ),
      }
    }

    case 'zakazka': {
      const j = await getJobDetail(ctx, business, ref.id)
      if (!j) return notHere('Zakázka', env.closeHref)
      const portalOn = env.modules.has('portal')
      const card = j.customerId ? await getCustomerCard(ctx, business, j.customerId) : null
      const invoices = env.modules.has('invoices')
      return {
        title: j.title,
        description: j.stageName ?? undefined,
        body: (
          <div className="flex flex-col gap-5">
            <JobSummary job={j} today={env.today} now={new Date()} customerHref={j.customerId ? customerLink(j.customerId) : null} />

            <JobStageControl
              slug={business.slug}
              jobId={j.id}
              stageId={j.stageId}
              stages={j.stages}
              invoiceHref={invoices ? navHref(business.slug, 'faktury') + '?detail=nova-faktura&zakazka=' + j.id : null}
            />

            {(j.review || j.requestId) && (
              <dl className="flex flex-col gap-3 text-[15px]">
                {j.review && (
                  <Row label="Hodnocení">
                    <span className="font-num">{j.review.score} / 10</span>
                    {j.review.comment && <span className="mt-1 block whitespace-pre-line text-quiet">{j.review.comment}</span>}
                  </Row>
                )}
                {j.requestId && (
                  <Row label="Z poptávky">
                    <Link
                      href={hrefWith(env.pathname, env.searchParams, { detail: `poptavka:${j.requestId}`, ...FORM_PARAMS })}
                      scroll={false}
                      className="font-semibold text-navy-700 underline-offset-4 hover:underline dark:text-navy-200"
                    >
                      Otevřít poptávku
                    </Link>
                  </Row>
                )}
              </dl>
            )}

            {portalOn ? (
              <section aria-label="Pro zákazníka" className="flex flex-col gap-4 border-t pt-5">
                <h3 className="text-[16px] font-semibold text-ink">Pro zákazníka</h3>
                <p className="-mt-2 text-sm text-quiet">Zákazník v odkazu vidí postup podle stavů, vaše zprávy a výsledek. Poznámky z aplikace nevidí.</p>
                <CopyPortalLink url={await portalPageUrl(j.publicToken)} />
                <JobUpdates
                  slug={business.slug}
                  jobId={j.id}
                  canEmail={j.customerEmail}
                  updates={j.updates.map((u) => {
                    const p = pragueParts(u.at)
                    return { id: u.id, body: u.body, when: `${formatDayShort(p.date)} · ${formatMinutes(p.minutes)}` }
                  })}
                />
                <JobResultForm slug={business.slug} jobId={j.id} url={j.resultUrl} />
              </section>
            ) : (
              <p className="border-t pt-5 text-sm text-quiet">
                Když v Nastavení › Funkce zapnete Klientský portál, pošlete zákazníkovi odkaz, kde uvidí postup zakázky.
              </p>
            )}

            <JobHistory job={j} today={env.today} />

            {card && (
              <section aria-label="Zákazník" className="border-t pt-5">
                <CustomerSummary card={card} today={env.today} businessName={business.name} detailHref={customerLink(card.id)} />
              </section>
            )}
          </div>
        ),
      }
    }

    case 'nova-rezervace': {
      const day = first(env.searchParams.den)
      const minutesRaw = Number(first(env.searchParams.cas))
      const staffParam = first(env.searchParams.pracovnik)
      const customerParam = first(env.searchParams.zakaznik)
      const [options, customer] = await Promise.all([
        getBookingOptions(ctx, business),
        customerParam && UUID_RE.test(customerParam) ? getCustomerOption(ctx, customerParam.toLowerCase()) : null,
      ])
      return {
        title: 'Nová rezervace',
        body: (
          <BookingForm
            slug={business.slug}
            closeHref={env.closeHref}
            services={options.services}
            staff={options.staff}
            today={env.today}
            prefill={{
              name: first(env.searchParams.kdo)?.slice(0, 80) ?? '',
              customer: customer ? { id: customer.id, name: customer.name } : null,
              day: isIsoDate(day) ? day : null,
              minutes: Number.isInteger(minutesRaw) && minutesRaw >= 0 && minutesRaw < 1440 ? minutesRaw : null,
              service: first(env.searchParams.sluzba)?.slice(0, 80) ?? '',
              staffId: staffParam && UUID_RE.test(staffParam) && options.staff.some((s) => s.id === staffParam) ? staffParam : null,
            }}
          />
        ),
      }
    }

    case 'najit-cas': {
      const options = await getBookingOptions(ctx, business)
      return {
        title: 'Najít volný čas',
        description: 'Nejbližší volné časy podle vaší otevírací doby.',
        body: (
          <FindSlotForm
            slug={business.slug}
            services={options.services}
            staff={options.staff}
            pathname={env.pathname}
            params={Object.fromEntries(Object.entries(env.searchParams).flatMap(([k, v]) => (first(v) === undefined ? [] : [[k, first(v) as string]])))}
            settingsHref={`${navHref(business.slug, 'nastaveni')}/oteviraci-doba`}
          />
        ),
      }
    }

    case 'nova-blokace': {
      const options = await getBookingOptions(ctx, business)
      return {
        title: 'Blokace',
        description: 'Dovolená, školení nebo zavřeno.',
        body: <BlockForm slug={business.slug} closeHref={env.closeHref} staff={options.staff} today={env.today} />,
      }
    }

    case 'nova-faktura':
      return {
        title: 'Nová faktura',
        body: <InvoiceForm slug={business.slug} today={env.today} options={await getInvoiceOptions(ctx, business)} closeHref={env.closeHref} customerId={first(env.searchParams.zakaznik)} />,
      }

  }
}

function notHere(title: string, closeHref: string) {
  return {
    title,
    body: (
      <div className="flex flex-col items-start gap-4">
        <p className="text-[15px] text-quiet">Tenhle záznam tu není. Možná byl smazaný, nebo patří jinému byznysu.</p>
        <Link href={closeHref} scroll={false} className="text-[15px] font-semibold text-navy-700 underline-offset-4 hover:underline dark:text-navy-200">
          Zavřít
        </Link>
      </div>
    ),
  }
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3">
      <dt className="font-num text-[11px] uppercase leading-6 tracking-[0.08em] text-quiet">{label}</dt>
      <dd className="min-w-0 text-ink">{children}</dd>
    </div>
  )
}
