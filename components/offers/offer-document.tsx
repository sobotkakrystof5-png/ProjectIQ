import { Check, Mail, Phone } from 'lucide-react'
import { OfferChoice } from '@/components/offers/offer-choice'
import { OfferSeen } from '@/components/offers/offer-seen'
import type { ClientOffer } from '@/lib/admin/offers/proposal-model'

/**
 * Stránka nabídky ve značce dodavatele (VIZEON), R-155. Stejná pro klienta
 * (`/nabidka/[token]`) i pro náhled Kryštofa (`preview`). Ukazuje jen co
 * klient dostane, cenu a větu o návratnosti; obrázek o firmě z rozboru sem
 * nepatří (plán, oddíl 5 „Co vidí klient"). Všechen text jen jako text.
 */

export type OfferIssuer = {
  brand: string
  person: string
  email: string
  phone: string
  web: string
  vatPayer: boolean
}

const date = (iso: string) =>
  new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'Europe/Prague' }).format(
    new Date(iso),
  )

export function OfferDocument({
  offer,
  issuer,
  token,
  preview = false,
}: {
  offer: ClientOffer
  issuer: OfferIssuer
  /** `null` = náhled bez odkazu (koncept). */
  token: string | null
  preview?: boolean
}) {
  const web = issuer.web.replace(/^https?:\/\//, '').replace(/\/$/, '')
  return (
    <div className="min-h-screen bg-ground">
      {!preview && token !== null && <OfferSeen token={token} />}
      {preview && (
        <div className="bg-navy-50 px-4 py-3 text-center text-sm text-ink">
          Náhled: takhle nabídku uvidí klient. Tlačítka jsou tady vypnutá.
        </div>
      )}

      <header className="bg-navy-950 px-4 pb-10 pt-6 text-white sm:px-6 sm:pb-14">
        <div className="mx-auto flex max-w-5xl flex-col gap-8">
          <p className="text-lg font-semibold tracking-[0.06em]">{issuer.brand}</p>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-navy-200">Nabídka nového webu</p>
            <h1 className="text-[30px] font-semibold leading-[1.05] tracking-[-0.03em] sm:text-[44px]">Pro {offer.company}</h1>
            <p className="font-num text-sm text-navy-200">
              {offer.sentAt && `Připraveno ${date(offer.sentAt)}`}
              {offer.validUntil && ` · platí do ${date(offer.validUntil)}`}
            </p>
          </div>
        </div>
      </header>

      <main className="px-4 py-8 sm:px-6 sm:py-12">
        <div className="mx-auto flex max-w-5xl flex-col gap-8">
        {offer.expired && !offer.locked && (
          <p role="status" className="rounded-box border border-navy-100 bg-surface px-5 py-4 text-[15px] text-ink">
            Platnost nabídky skončila{offer.validUntil ? ` ${date(offer.validUntil)}` : ''}. Napište mi a ceny vám rád potvrdím
            znovu.
          </p>
        )}
        {offer.locked && (
          <p role="status" className="rounded-box border border-navy-100 bg-navy-50 px-5 py-4 text-[15px] text-ink">
            Na vašem webu už pracuji. Kdybyste cokoli potřebovali, napište mi.
          </p>
        )}

        <section className="flex flex-col gap-4">
          <p className="max-w-3xl whitespace-pre-line text-[17px] leading-7 text-ink">{offer.intro}</p>
          {offer.payback && <p className="text-[17px] font-semibold text-ink">{offer.payback}</p>}
        </section>

        <OfferChoice token={token} offer={offer} preview={preview} />

        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-box border border-navy-100 bg-surface p-5 sm:p-6">
            <h2 className="text-lg font-semibold tracking-[-0.02em] text-ink">V ceně je vždy</h2>
            <ul className="mt-4 flex flex-col gap-2">
              {offer.always.map((item) => (
                <li key={item} className="flex gap-2.5 text-[15px] leading-6 text-ink">
                  <Check size={17} strokeWidth={2} className="mt-[3px] shrink-0 text-navy-700" aria-hidden />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-box border border-navy-100 bg-surface p-5 sm:p-6">
            <h2 className="text-lg font-semibold tracking-[-0.02em] text-ink">Platba</h2>
            <p className="mt-4 text-[15px] leading-6 text-ink">
              {offer.depositPercent > 0
                ? `${offer.depositPercent} % ceny předem, zbytek po předání hotového webu.`
                : 'Celá cena po předání hotového webu.'}
            </p>
            <p className="mt-2 text-[15px] leading-6 text-ink">
              {issuer.vatPayer ? 'K cenám se připočítá DPH.' : 'Ceny jsou konečné, nejsem plátce DPH.'}
            </p>
          </div>
        </section>

        <section className="rounded-box border border-navy-100 bg-surface p-5 sm:p-6">
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-ink">Máte otázku?</h2>
          <p className="mt-2 text-[15px] text-quiet">Napište mi nebo zavolejte, rád vám nabídku vysvětlím.</p>
          <div className="mt-4 flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:gap-x-6">
            {issuer.person && <p className="flex min-h-11 items-center text-[15px] font-semibold text-ink">{issuer.person}</p>}
            {issuer.email && (
              <a href={`mailto:${issuer.email}`} className="flex min-h-11 items-center gap-2 text-[15px] text-navy-700 underline underline-offset-2">
                <Mail size={16} strokeWidth={1.75} aria-hidden />
                {issuer.email}
              </a>
            )}
            {issuer.phone && (
              <a
                href={`tel:${issuer.phone.replace(/\s/g, '')}`}
                className="flex min-h-11 items-center gap-2 font-num text-[15px] text-navy-700 underline underline-offset-2"
              >
                <Phone size={16} strokeWidth={1.75} aria-hidden />
                {issuer.phone}
              </a>
            )}
          </div>
        </section>
        </div>
      </main>

      <footer className="px-4 pb-10 text-center text-xs text-quiet sm:px-6">
        {issuer.brand}
        {web && ` · ${web}`} · Vystaveno v systému ZakazIQ
      </footer>
    </div>
  )
}
