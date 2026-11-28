import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader, PageShell } from '@/components/ws/app/page-header'
import { Badge } from '@/components/ui/badge'
import { Card, CardHead } from '@/components/admin/card'
import { SuggestionsPanel } from '@/components/admin/offers/suggestions-panel'
import { NewOfferForm } from '@/components/admin/offers/new-offer-form'
import { requireAdminPage } from '@/lib/auth'
import { listRecentProposals, listSuggestions, loadOfferReview } from '@/lib/admin/offers/proposals'
import { PROPOSAL_STATUS_LABEL, variantOf } from '@/lib/admin/offers/proposal-model'
import { OFFER_STATUS_TONE, toneVariant } from '@/lib/admin-status'

export const metadata: Metadata = { title: 'Nabídky' }
export const dynamic = 'force-dynamic'

/**
 * Nabídky z navrhovače (R-147, R-155, R-160): nová nabídka pro firmu (web,
 * IČO nebo název → rozbor → návrh se připraví sám), jak se daří za poslední
 * 3 měsíce (N3) po pásmech i podle podílu ceny z hodnoty, návrhy úprav cenových
 * pravidel, odhad poptávek proti skutečnosti (N4) a seznam nabídek. Nabídka
 * odchází z karty kontaktu.
 */

const czk = (n: number) => `${n.toLocaleString('cs-CZ')} Kč`
const pct = (x: number | null) => (x === null ? '–' : `${Math.round(x * 100)} %`)
const dateText = (iso: string) =>
  new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'Europe/Prague' }).format(new Date(iso))

const VERDICT = { under: 'méně, než odhad', within: 'v odhadu', over: 'víc, než odhad' } as const

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-chip border border-navy-100 px-4 py-3">
      <span className="text-xs text-quiet">{label}</span>
      <span className="font-num text-2xl font-semibold text-ink">{value}</span>
      {note && <span className="text-xs text-quiet">{note}</span>}
    </div>
  )
}

export default async function NabidkyPage() {
  await requireAdminPage()

  const data = await Promise.all([loadOfferReview(), listSuggestions(), listRecentProposals()]).catch((err: unknown) => {
    const code = (err as { code?: unknown })?.code
    if (code === '42P01' || code === '42703') return null
    throw err
  })

  return (
    <PageShell width="wide">
      <PageHeader
        title="Nabídky"
        subtitle="Zadejte firmu. Agenti ji prohledají, nabídka se připraví sama a pošlete ji z karty kontaktu."
        subtitleFont="sans"
        action={
          <Link
            href="/dashboard/nabidky/pravidla"
            className="inline-flex min-h-11 items-center rounded-full border border-navy-200 px-4 text-sm font-medium text-ink hover:bg-navy-50"
          >
            Cenová pravidla
          </Link>
        }
      />

      {data === null ? (
        <Card>
          <p className="text-sm text-quiet">Nabídky zatím nejdou zobrazit: databáze ještě nemá migraci 142.</p>
        </Card>
      ) : (
        <Body review={data[0].review} suggestions={data[1]} proposals={data[2]} />
      )}
    </PageShell>
  )
}

function Body({
  review,
  suggestions,
  proposals,
}: {
  review: Awaited<ReturnType<typeof loadOfferReview>>['review']
  suggestions: Awaited<ReturnType<typeof listSuggestions>>
  proposals: Awaited<ReturnType<typeof listRecentProposals>>
}) {
  const goal = review.withinTen.total > 0 ? review.withinTen.hit / review.withinTen.total : null
  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex min-w-0 flex-col gap-8">
        <Card>
          <CardHead
            title="Nová nabídka"
            hint="Rozbor webu a firmy z veřejných zdrojů trvá pár minut. Pak se spočítají tři varianty podle vašich cenových pravidel."
          />
          <NewOfferForm />
        </Card>

        <Card>
          <CardHead title="Poslední 3 měsíce" hint="Zdravá úspěšnost je 30–50 % přijatých nabídek. Referenční ceny se nepočítají." />
          {review.sent === 0 ? (
            <p className="text-sm text-quiet">Zatím žádná odeslaná nabídka. Začněte firmou nahoře.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="Odesláno" value={String(review.sent)} note={review.pending > 0 ? `čeká ${review.pending}` : undefined} />
              <Stat
                label="Přijato"
                value={pct(review.successRate)}
                note={review.resolved > 0 ? `${review.accepted} z ${review.resolved} s výsledkem` : 'zatím bez výsledku'}
              />
              <Stat
                label="Cena podle pravidel"
                value={goal === null ? '–' : `${review.withinTen.hit} z ${review.withinTen.total}`}
                note="±10 %, cíl dvě třetiny"
              />
              <Stat label="Otevřeno" value={`${review.opened} z ${review.sent}`} />
            </div>
          )}
          {review.bands.length > 0 && (
            <ul className="mt-5 flex flex-col divide-y divide-navy-100 text-sm">
              {review.bands.map((b) => (
                <li key={String(b.band)} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="text-ink">{b.label}</span>
                  <span className="font-num text-quiet">
                    {b.sent} odesláno · {b.accepted} z {b.resolved} přijato
                  </span>
                </li>
              ))}
            </ul>
          )}
          {review.shares.length > 0 && (
            <div className="mt-5">
              <p className="text-sm font-semibold text-ink">Podle podílu z hodnoty</p>
              <p className="text-xs text-quiet">
                Cena doporučené varianty proti tomu, co web klientovi podle rozboru přinese za rok.
              </p>
              <ul className="mt-2 flex flex-col divide-y divide-navy-100 text-sm">
                {review.shares.map((s) => (
                  <li key={s.bucket} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="text-ink">{s.label}</span>
                    <span className="font-num text-quiet">
                      {s.sent} odesláno · {s.accepted} z {s.resolved} přijato
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        <Card>
          <CardHead title="Všechny nabídky" />
          {proposals.length === 0 ? (
            <p className="text-sm text-quiet">Zatím žádná nabídka.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-navy-100">
              {proposals.map((p) => {
                const rec = variantOf(p.sent_variants ?? p.variants, p.recommended)
                const chosen = p.chosen_variant ? variantOf(p.sent_variants ?? p.variants, p.chosen_variant) : null
                return (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
                    <div className="min-w-0">
                      <Link
                        href={`/dashboard/kontakty/${p.contact_id}`}
                        className="text-sm font-semibold text-ink underline-offset-2 hover:underline"
                      >
                        {p.company}
                      </Link>
                      <p className="font-num text-xs text-quiet">
                        {dateText(p.sent_at ?? p.created_at)}
                        {rec && ` · doporučená ${czk(rec.price)}`}
                        {chosen && ` · vybral ${chosen.name}`}
                        {p.final_price_czk !== null && ` · zakázka ${czk(p.final_price_czk)}`}
                      </p>
                    </div>
                    <Badge variant={toneVariant(OFFER_STATUS_TONE[p.status])}>{PROPOSAL_STATUS_LABEL[p.status]}</Badge>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>

      <div className="flex min-w-0 flex-col gap-8">
        <Card>
          <CardHead title="Návrhy úprav pravidel" hint="Z odeslaných nabídek. Platí až po přijetí." />
          <SuggestionsPanel suggestions={suggestions} />
        </Card>

        <Card>
          <CardHead title="Odhad a skutečnost" hint="Kolik poptávek web zakázky opravdu přinesl proti odhadu z rozboru." />
          {review.actual.length === 0 ? (
            <p className="text-sm text-quiet">
              Až web zakázky z nabídky začne počítat poptávky (karta Poptávky z webu u zakázky) a uběhne měsíc, uvidíte tady,
              jestli odhad sedí.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-navy-100">
              {review.actual.map((a) => (
                <li key={a.id} className="flex flex-col gap-0.5 py-3">
                  <Link href={`/dashboard/kontakty/${a.contactId}`} className="text-sm font-semibold text-ink hover:underline">
                    {a.company}
                  </Link>
                  <p className="text-sm text-ink">
                    <span className="font-num">{a.perMonth.toLocaleString('cs-CZ')}</span> poptávek měsíčně za{' '}
                    <span className="font-num">{a.months.toLocaleString('cs-CZ')}</span> měs., odhad{' '}
                    <span className="font-num">
                      {a.estimate.min}–{a.estimate.max}
                    </span>
                  </p>
                  <p className="text-xs text-quiet">{VERDICT[a.verdict]}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
