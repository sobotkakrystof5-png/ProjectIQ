import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Logo } from '@/components/ws/brand'
import { buttonVariants } from '@/components/ui/button'
import { getBillingState, syncCheckoutSession } from '@/lib/ws/billing'
import { requireWorkspace } from '@/lib/ws/context'

export const metadata: Metadata = { title: 'Předplatné' }

// Návrat ze Stripe Checkoutu (success_url, S08). Webhook může dorazit až po
// přesměrování, proto se předplatné synchronizuje tady podle session_id —
// relace musí patřit přihlášenému účtu (syncCheckoutSession). Pak do aplikace
// s uvítáním (?vitejte=1, obrazovka Dnes v S09).

export default async function PredplatnePage({ searchParams }: { searchParams: { session_id?: string | string[] } }) {
  const ctx = await requireWorkspace()
  const sessionId = typeof searchParams.session_id === 'string' ? searchParams.session_id : ''

  try {
    if (sessionId) await syncCheckoutSession(ctx, sessionId)
  } catch (e) {
    // Nevadí — předplatné dorovná webhook. Rozhoduje stav níže.
    console.error('[ws/predplatne] synchronizace po Checkoutu selhala', {
      accountId: ctx.accountId,
      error: (e as Error).message,
    })
  }

  const billing = await getBillingState(ctx.accountId)
  if (billing.access !== 'none') redirect('/w?vitejte=1')

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-ground px-4 text-center text-ink">
      <Logo size={40} animated />
      <div className="flex max-w-sm flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">Ověřujeme platbu</h1>
        <p className="text-[15px] text-quiet">
          Stripe nám ji ještě nepotvrdil. Obvykle to trvá pár vteřin, zkuste to prosím znovu.
        </p>
      </div>
      <Link href={`/w/predplatne${sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : ''}`} className={buttonVariants()}>
        Zkusit znovu
      </Link>
    </main>
  )
}
