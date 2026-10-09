import Link from 'next/link'
import { CircleAlert } from 'lucide-react'
import type { BillingState } from '@/lib/ws/billing'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/ws/utils'
import { BillingActionButton } from './billing-action-button'
import { formatBillingDate } from './format'

/**
 * Pruh nahoře v aplikaci, jen když s předplatným něco není v pořádku (S08):
 * - `grace` — platba se nepovedla, lhůta 7 dní na novou kartu
 * - `read_only` — předplatné neběží, data jdou jen prohlížet
 * Jinak nevykreslí nic. Akci vidí jen vlastník, pracovník dostane radu.
 */
export function BillingBanner({ state, isOwner }: { state: BillingState; isOwner: boolean }) {
  if (state.access !== 'grace' && state.access !== 'read_only') return null
  const grace = state.access === 'grace'
  // Nezaplacené předplatné se opraví výměnou karty, ne novým předplatným.
  const unpaid = state.status === 'past_due'

  const title = grace ? 'Platba se nepovedla' : 'Účet jde teď jen prohlížet'
  const text = grace
    ? state.graceEndsAt
      ? `Aktualizujte prosím kartu do ${formatBillingDate(state.graceEndsAt)}. Potom půjde účet jen prohlížet.`
      : 'Aktualizujte prosím kartu, jinak půjde účet brzy jen prohlížet.'
    : unpaid
      ? 'Platba se nepovedla a lhůta vypršela. Data zůstávají a poptávky z webu se ukládají dál.'
      : 'Předplatné neběží. Data zůstávají a poptávky z webu se ukládají dál.'

  return (
    <div
      role={grace ? 'alert' : 'status'}
      className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-box border border-danger/30 bg-surface px-4 py-3 sm:px-5"
    >
      <CircleAlert aria-hidden size={20} strokeWidth={1.5} className="shrink-0 text-danger" />
      <div className="min-w-0 flex-1 basis-[240px]">
        <p className="text-[15px] font-semibold text-ink">{title}</p>
        <p className="text-sm text-quiet">{isOwner ? text : `${text} Dejte prosím vědět majiteli účtu.`}</p>
      </div>
      {isOwner &&
        (unpaid ? (
          <BillingActionButton action={{ kind: 'portal' }} variant="outline">
            Aktualizovat kartu
          </BillingActionButton>
        ) : (
          <Link href="/w/ucet" className={cn(buttonVariants({ variant: 'outline' }))}>
            Obnovit předplatné
          </Link>
        ))}
    </div>
  )
}
