import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, FileDown } from 'lucide-react'
import { AccentHeading, EmptyState, SectionLabel } from '@/components/ws/brand'
import { BillingActionButton } from '@/components/ws/billing/billing-action-button'
import { formatBillingDate } from '@/components/ws/billing/format'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { getBillingState, listInvoices, type AccountInvoice, type BillingState } from '@/lib/ws/billing'
import { requireRole, requireWorkspace } from '@/lib/ws/context'
import { formatMoney } from '@/lib/ws/money'

export const metadata: Metadata = { title: 'Účet' }

// Účet → předplatné (S08): stav, další platba, Customer Portal Stripe (karta,
// zrušení) a doklady od Stripe. Jen pro vlastníka — pracovník dostane 404.
// Do kostry aplikace (postranní panel) ji zapojí S09.

type Summary = { badge: string; variant: NonNullable<BadgeProps['variant']>; text: string }

function summary(s: BillingState): Summary {
  const end = s.periodEnd ? formatBillingDate(s.periodEnd) : null
  switch (s.access) {
    case 'trialing':
      return {
        badge: 'Zkušební doba',
        variant: 'confirmed',
        text: s.cancelAtPeriodEnd
          ? `Předplatné jste zrušili. Skončí ${end ?? 'se zkušební dobou'} a nic se nezaplatí.`
          : `Zdarma do ${end ?? 'konce zkušební doby'}. Potom 249 Kč měsíčně.`,
      }
    case 'active':
      return {
        badge: 'Aktivní',
        variant: 'strong',
        text: s.cancelAtPeriodEnd
          ? `Předplatné jste zrušili. Platí do ${end ?? 'konce zaplaceného období'}.`
          : `Další platba 249 Kč ${end ?? 'za měsíc'}.`,
      }
    case 'grace':
      return {
        badge: 'Platba se nepovedla',
        variant: 'danger',
        text: `Aktualizujte prosím kartu${s.graceEndsAt ? ` do ${formatBillingDate(s.graceEndsAt)}` : ''}. Potom půjde účet jen prohlížet.`,
      }
    case 'read_only':
      return {
        badge: 'Neběží',
        variant: 'danger',
        text:
          s.status === 'past_due'
            ? 'Platba se nepovedla a lhůta vypršela. Data vidíte, ale měnit je nejde, dokud neaktualizujete kartu.'
            : 'Data vidíte, ale měnit je nejde. Poptávky z webu se ukládají dál.',
      }
    case 'none':
      return { badge: 'Bez předplatného', variant: 'neutral', text: 'Předplatné jste ještě nezaložili.' }
  }
}

function invoiceAmount(i: AccountInvoice): string {
  const currency = i.currency.toUpperCase()
  return currency === 'CZK' || currency === 'EUR'
    ? formatMoney(i.total, { currency, minor: true })
    : `${(i.total / 100).toFixed(2)} ${currency}`
}

export default async function UcetPage() {
  const ctx = await requireWorkspace()
  requireRole(ctx, 'owner')

  const billing = await getBillingState(ctx.accountId)
  let invoices: AccountInvoice[] | null
  try {
    invoices = await listInvoices(ctx)
  } catch (e) {
    console.error('[ws/ucet] doklady ze Stripe se nenačetly', { accountId: ctx.accountId, error: (e as Error).message })
    invoices = null
  }
  const s = summary(billing)

  return (
    <main className="mx-auto flex min-h-screen max-w-[880px] flex-col gap-8 bg-ground px-4 py-8 text-ink sm:px-8 lg:py-10">
      <Link
        href="/w"
        className="inline-flex min-h-[44px] items-center gap-2 self-start rounded-full text-sm text-quiet transition-colors duration-200 ease-zq hover:text-ink"
      >
        <ArrowLeft aria-hidden size={18} strokeWidth={1.5} />
        Zpět do aplikace
      </Link>

      <div className="flex flex-col gap-2">
        <SectionLabel>Účet</SectionLabel>
        <AccentHeading accent="a doklady.">Předplatné</AccentHeading>
      </div>

      <section aria-labelledby="ucet-predplatne" className="flex flex-col gap-5 rounded-panel border border-navy-100 bg-surface p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="ucet-predplatne" className="text-lg font-semibold tracking-[-0.01em]">
            ZakazIQ · <span className="font-num">249 Kč</span> měsíčně
          </h2>
          <Badge variant={s.variant}>{s.badge}</Badge>
        </div>
        <p className="text-[15px] text-quiet">{s.text}</p>
        <div className="border-t border-navy-100 pt-5">
          {billing.access === 'none' ? (
            <Link href="/w/novy" className={buttonVariants()}>
              Založit předplatné
            </Link>
          ) : billing.access === 'read_only' && billing.status !== 'past_due' ? (
            <BillingActionButton action={{ kind: 'checkout', from: 'ucet' }}>Obnovit předplatné</BillingActionButton>
          ) : (
            <BillingActionButton action={{ kind: 'portal' }}>
              {billing.status === 'past_due' ? 'Aktualizovat kartu' : 'Spravovat předplatné'}
            </BillingActionButton>
          )}
          {billing.access !== 'none' && (billing.access !== 'read_only' || billing.status === 'past_due') && (
            <p className="mt-3 text-xs text-quiet">Změna karty, fakturační údaje a zrušení předplatného na stránce Stripe.</p>
          )}
        </div>
      </section>

      <section aria-labelledby="ucet-doklady" className="flex flex-col gap-4">
        <h2 id="ucet-doklady" className="text-lg font-semibold tracking-[-0.01em]">
          Doklady
        </h2>
        {invoices === null ? (
          <p role="status" className="text-[15px] text-quiet">
            Doklady se teď nepodařilo načíst. Zkuste to prosím za chvíli.
          </p>
        ) : invoices.length === 0 ? (
          <EmptyState
            title="Zatím žádný doklad"
            description="Doklad přijde e-mailem s každou platbou a najdete ho i tady."
          />
        ) : (
          <ul className="overflow-hidden rounded-box border border-navy-100 bg-surface">
            {invoices.map((i) => (
              <li
                key={i.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-navy-100 px-4 py-3 first:border-t-0 sm:px-5"
              >
                <span className="font-num text-sm">{formatBillingDate(i.created)}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-quiet">{i.number ?? 'Doklad'}</span>
                <span className="font-num text-sm">{invoiceAmount(i)}</span>
                <Badge variant={i.paid ? 'confirmed' : 'danger'}>{i.paid ? 'Zaplaceno' : 'Nezaplaceno'}</Badge>
                {(i.pdf ?? i.url) && (
                  <a
                    href={(i.pdf ?? i.url) as string}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-semibold text-navy-700 hover:text-navy-900"
                  >
                    <FileDown aria-hidden size={18} strokeWidth={1.5} />
                    Stáhnout
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
