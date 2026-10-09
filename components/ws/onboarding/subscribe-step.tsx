import { Check } from 'lucide-react'
import { AccentHeading, SectionLabel } from '@/components/ws/brand'
import { BillingActionButton } from '@/components/ws/billing/billing-action-button'
import { formatBillingDate } from '@/components/ws/billing/format'
import { PRICE_INCLUDES } from '@/components/marketing/content'
import { WizardHeader } from './wizard-header'

/**
 * Průvodce Nový byznys, krok 2 ze 2: předplatné (S08, R-038). 14 dní zdarma,
 * karta se zadává hned ve Stripe Checkoutu, první platba po zkušební době.
 * Pracovník (ne vlastník) předplatné založit nemůže — dostane radu.
 */
export function SubscribeStep({
  businessName,
  firstPaymentOn,
  isOwner,
}: {
  businessName: string | null
  firstPaymentOn: Date
  isOwner: boolean
}) {
  return (
    <div className="min-h-screen bg-ground text-ink">
      <WizardHeader step={2} />

      <div className="mx-auto flex max-w-[1240px] flex-wrap items-start gap-8 px-4 pb-12 pt-8 sm:px-8 lg:pt-10">
        <section aria-labelledby="predplatne-nadpis" className="flex min-w-0 flex-[3_1_520px] flex-col gap-6">
          <div className="flex flex-col gap-2">
            <SectionLabel>{businessName ? `Krok 2 ze 2 · ${businessName}` : 'Krok 2 ze 2'}</SectionLabel>
            <AccentHeading id="predplatne-nadpis" accent="14 dní zdarma.">
              Vyzkoušejte to
            </AccentHeading>
            <p className="max-w-[540px] text-[15px] leading-relaxed text-quiet">
              Kartu zadáte teď, ale první platba proběhne až{' '}
              <span className="font-num text-ink">{formatBillingDate(firstPaymentOn)}</span>. Když předplatné do té
              doby zrušíte, nezaplatíte nic.
            </p>
          </div>

          <div>
            <h2 className="font-num text-xs uppercase tracking-[0.12em] text-quiet">V ceně</h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {PRICE_INCLUDES.map((item) => (
                <li key={item} className="flex items-start gap-3 text-[15px]">
                  <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] bg-navy-100">
                    <Check size={14} strokeWidth={1.5} className="text-navy-700" aria-hidden />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <aside
          aria-label="Předplatné"
          className="flex min-w-0 flex-[2_1_360px] flex-col gap-6 rounded-panel border border-navy-100 bg-surface p-6 lg:sticky lg:top-6"
        >
          <div className="flex flex-col gap-1">
            <SectionLabel>Předplatné</SectionLabel>
            <p className="flex items-baseline gap-2">
              <span className="font-num text-5xl font-medium tracking-[-0.04em]">249</span>
              <span className="text-lg text-quiet">
                <span className="font-num text-ink">Kč</span> / měsíc
              </span>
            </p>
            <p className="text-sm text-quiet">Konečná cena, nic se nepřipočítává.</p>
          </div>

          <dl className="flex flex-col text-sm">
            <div className="flex justify-between gap-3 border-t border-navy-100 py-2.5">
              <dt className="text-quiet">Dnes</dt>
              <dd className="font-num">0 Kč</dd>
            </div>
            <div className="flex justify-between gap-3 border-t border-navy-100 py-2.5">
              <dt className="text-quiet">První platba</dt>
              <dd className="font-num">{formatBillingDate(firstPaymentOn)}</dd>
            </div>
          </dl>

          <div className="flex flex-col gap-3 border-t border-navy-100 pt-5">
            {isOwner ? (
              <BillingActionButton action={{ kind: 'checkout', from: 'novy' }} size="lg" className="w-full">
                Pokračovat k platbě
              </BillingActionButton>
            ) : (
              <p role="status" className="text-[15px]">
                Předplatné zakládá majitel účtu. Dejte mu prosím vědět.
              </p>
            )}
            <p className="text-center text-xs text-quiet">
              Platíte kartou, Apple Pay nebo Google Pay přes Stripe. Zrušíte kdykoli v Účtu.
            </p>
          </div>
        </aside>
      </div>
    </div>
  )
}
