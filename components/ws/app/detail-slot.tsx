import Link from 'next/link'
import type { WsBusiness, WsContext } from '@/lib/ws/context'
import { detailValue, hrefWith, parseDetail, type DetailRef } from '@/lib/ws/detail-param'
import { getCustomerCard, getRequestDetail } from '@/lib/ws/today'
import { formatDayShort, formatMinutes, formatRelativeDay, isIsoDate, pragueParts } from '@/lib/ws/time'
import { NewRequestBlock, TimeRange } from '@/components/ws/brand'
import { CustomerSummary, formatPhone } from './customer-summary'
import { DetailSheet } from './detail-sheet'

type Params = Record<string, string | string[] | undefined>

const SOURCE_LABELS: Record<string, string> = {
  web: 'z webu',
  widget: 'z webu',
  page: 'z objednávací stránky',
  eshop: 'z e-shopu',
  phone: 'telefonem',
  manual: 'zapsaná ručně',
}

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

/**
 * Pravý panel podle `?detail=` na kterékoli obrazovce byznysu. Data se čtou
 * na serveru přes kontext účtu; cizí nebo smazaný záznam = „není tu".
 */
export async function DetailSlot({
  ctx,
  business,
  pathname,
  searchParams,
  today,
}: {
  ctx: WsContext
  business: WsBusiness
  pathname: string
  searchParams: Params
  today: string
}) {
  const ref = parseDetail(searchParams.detail)
  if (!ref) return null
  // Zavřením panelu zmizí i předvyplněné údaje z příkazu ⌘K.
  const closeHref = hrefWith(pathname, searchParams, { detail: null, kdo: null, den: null, cas: null, sluzba: null })
  const key = detailValue(ref)
  const panel = await panelContent(ctx, business, ref, { pathname, searchParams, today, closeHref })
  return (
    <DetailSheet key={key} title={panel.title} description={panel.description} closeHref={closeHref}>
      {panel.body}
    </DetailSheet>
  )
}

async function panelContent(
  ctx: WsContext,
  business: WsBusiness,
  ref: DetailRef,
  env: { pathname: string; searchParams: Params; today: string; closeHref: string },
): Promise<{ title: string; description?: string; body: React.ReactNode }> {
  switch (ref.kind) {
    case 'zakaznik': {
      const card = await getCustomerCard(ctx, business, ref.id)
      if (!card) return notHere('Zákazník', env.closeHref)
      return { title: 'Zákazník', body: <CustomerSummary card={card} today={env.today} businessName={business.name} /> }
    }
    case 'poptavka': {
      const r = await getRequestDetail(ctx, business, ref.id)
      if (!r) return notHere('Poptávka', env.closeHref)
      const created = pragueParts(r.created_at)
      const card = r.customer_id ? await getCustomerCard(ctx, business, r.customer_id) : null
      return {
        title: r.status === 'new' ? 'Nová poptávka' : 'Poptávka',
        description: `Přišla ${SOURCE_LABELS[r.source] ?? ''} ${formatRelativeDay(created.date, env.today)} v ${formatMinutes(created.minutes)}`.replace(/\s+/g, ' '),
        body: (
          <div className="flex flex-col gap-5">
            {r.status === 'new' ? (
              r.wanted_start ? (
                <NewRequestBlock
                  start={r.wanted_start}
                  end={r.wanted_end ?? undefined}
                  day={formatRelativeDay(pragueParts(r.wanted_start).date, env.today)}
                  customer={r.customer_name}
                  service={r.service_name ?? undefined}
                />
              ) : (
                <NewRequestBlock customer={r.customer_name} service={r.service_name ?? undefined} />
              )
            ) : (
              <p className="text-[15px] text-quiet">{r.status === 'declined' ? 'Odmítnutá' : 'Vyřízená'} poptávka.</p>
            )}

            <dl className="flex flex-col gap-3 text-[15px]">
              {r.status !== 'new' && r.wanted_start && (
                <Row label="Chtěný termín">
                  <span className="font-num">{formatDayShort(pragueParts(r.wanted_start).date)} </span>
                  <TimeRange start={r.wanted_start} end={r.wanted_end ?? undefined} />
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

            {r.status === 'new' && (
              <p className="rounded-chip bg-navy-50 px-3 py-2.5 text-sm text-quiet dark:bg-navy-800 dark:text-navy-200">
                Potvrzení jedním klikem přidáme spolu s kalendářem. Zatím zákazníkovi zavolejte nebo napište.
              </p>
            )}

            {card && (
              <section aria-label="Zákazník" className="border-t pt-5">
                <CustomerSummary
                  card={card}
                  today={env.today}
                  businessName={business.name}
                  detailHref={hrefWith(env.pathname, env.searchParams, { detail: `zakaznik:${card.id}` })}
                />
              </section>
            )}
          </div>
        ),
      }
    }
    case 'nova-rezervace': {
      const who = first(env.searchParams.kdo)?.slice(0, 80) ?? ''
      const day = first(env.searchParams.den)
      const minutesRaw = Number(first(env.searchParams.cas))
      const minutes = Number.isInteger(minutesRaw) && minutesRaw >= 0 && minutesRaw < 1440 ? minutesRaw : null
      const service = first(env.searchParams.sluzba)?.slice(0, 80) ?? ''
      return {
        title: 'Nová rezervace',
        description: 'Zkontrolujte údaje.',
        body: (
          <div className="flex flex-col gap-5">
            <dl className="flex flex-col gap-3 text-[15px]">
              <Row label="Zákazník">{who || <Missing />}</Row>
              <Row label="Služba">{service || <Missing />}</Row>
              <Row label="Den">{isIsoDate(day) ? <span className="font-num">{formatDayShort(day)}</span> : <Missing />}</Row>
              <Row label="Čas">{minutes !== null ? <span className="font-num">{formatMinutes(minutes)}</span> : <Missing />}</Row>
            </dl>
            <p className="rounded-chip bg-navy-50 px-3 py-2.5 text-sm text-quiet dark:bg-navy-800 dark:text-navy-200">
              Ukládání rezervací přidáme spolu s kalendářem. Do té doby si termín poznamenejte.
            </p>
            <p className="text-sm text-quiet">
              Tip: v hledání (⌘K) napište třeba <span className="font-num">rezervace Tereza pátek 9:00</span> a údaje se vyplní samy.
            </p>
          </div>
        ),
      }
    }
    case 'nova-faktura':
      return {
        title: 'Nová faktura',
        body: (
          <p className="text-[15px] text-quiet">
            Vystavování faktur přidáme v další verzi aplikace, spolu s příjmy a odhadem daní.
          </p>
        ),
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

function Missing() {
  return <span className="text-quiet">doplňte</span>
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3">
      <dt className="font-num text-[11px] uppercase leading-6 tracking-[0.08em] text-quiet">{label}</dt>
      <dd className="min-w-0 text-ink">{children}</dd>
    </div>
  )
}
