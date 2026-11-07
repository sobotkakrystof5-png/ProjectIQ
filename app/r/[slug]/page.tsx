import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { OrderFlow } from '@/components/ws/order/order-flow'
import { Logo } from '@/components/ws/brand'
import { accentVars } from '@/lib/ws/accent'
import { businessBySlug } from '@/lib/ws/intake/http'
import { getOpenSessions, loadIntakeConfig, loadOrderAvailability } from '@/lib/ws/intake/intake'
import { orderSlots } from '@/lib/ws/intake/schema'
import { webFields } from '@/lib/ws/fields'
import { pragueToday } from '@/lib/ws/time'
import { cn } from '@/lib/ws/utils'
import type { OrderAvailability } from './actions'

// Objednávací stránka byznysu /r/[slug] (S11, R-016, plán „Odkaz, žádný kód“).
// Bez přihlášení, ve stylu Dílků s barvou byznysu. Neznámý nebo archivovaný
// slug = 404. Funguje i bez předplatného (poptávky se ukládají vždy, B5).
// Na širokém displeji je vlevo karta firmy s postupem (R-080), na telefonu
// a ve vloženém rámu jen formulář.

const load = cache(async (slug: string) => {
  const biz = await businessBySlug(slug)
  if (!biz) return null
  const config = await loadIntakeConfig(biz.accountId, biz.businessId)
  return config ? { biz, config } : null
})

export async function generateMetadata(props: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const params = await props.params
  const data = await load(params.slug)
  if (!data) return { title: 'Stránka nenalezena', robots: { index: false } }
  const name = data.config.business.name
  return {
    title: `Objednat · ${name}`,
    description: `Pošlete poptávku firmě ${name}. Termín vám potvrdí.`,
  }
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  return (words.length > 1 ? `${words[0][0]}${words[1][0]}` : (words[0] ?? '?').slice(0, 2)).toUpperCase()
}

/** Co se po odeslání stane. Stejná fakta jako v e-mailech (lib/ws/email). */
function howItGoes(booking: 'slots' | 'free' | 'none') {
  return [
    booking === 'slots' ? 'Vyberete službu a volný čas.' : booking === 'free' ? 'Vyberete službu a navrhnete čas.' : 'Napíšete, co potřebujete.',
    'Firma poptávku potvrdí.',
    'Potvrzení přijde e-mailem.',
  ]
}

export default async function OrderPage(props: { params: Promise<{ slug: string }>; searchParams?: Promise<{ embed?: string }> }) {
  const params = await props.params
  const searchParams = await props.searchParams
  const embedded = searchParams?.embed === '1'
  const data = await load(params.slug)
  if (!data) notFound()
  const { biz, config } = data
  const { business } = config

  // Jedna (nebo žádná) služba = volné časy hned; jinak až po výběru služby.
  let initialAvailability: OrderAvailability | null = null
  const initialSessions = await getOpenSessions(biz.accountId, biz.businessId, config.services.length === 1 ? [config.services[0].id] : [])
  if (config.booking === 'slots' && config.services.length <= 1) {
    const availability = await loadOrderAvailability(biz.accountId, config, config.services[0]?.id ?? null)
    initialAvailability = { slots: orderSlots(availability.slots), staff: availability.staff, sessions: initialSessions }
  } else if (initialSessions.length) {
    initialAvailability = { slots: [], staff: [], sessions: initialSessions }
  }

  const flow = (
    <OrderFlow
      slug={business.slug}
      businessName={business.name}
      embedded={embedded}
      services={config.services.map((s) => ({
        id: s.id,
        name: s.name,
        durationMin: s.duration_min,
        price: s.price,
        currency: s.currency,
      }))}
      fields={webFields(config.fields).map((f) => ({
        key: f.key,
        label: f.label,
        type: f.type,
        required: f.required,
        options: f.options,
        help: f.help_text ?? null,
      }))}
      booking={config.booking}
      hasSessions={initialSessions.length > 0}
      initialAvailability={initialAvailability}
      today={pragueToday()}
    />
  )

  const identity = (compact: boolean) => (
    <div className="flex items-center gap-3">
      <span
        aria-hidden
        className={cn(
          'inline-flex shrink-0 items-center justify-center rounded-chip bg-navy-700 font-semibold text-white',
          compact ? 'h-11 w-11 text-[15px]' : 'h-14 w-14 rounded-box text-[19px]',
        )}
      >
        {initials(business.name)}
      </span>
      <div className="flex min-w-0 flex-col">
        <h1 className={cn('truncate font-semibold leading-tight tracking-[-0.02em] text-ink', compact ? 'text-[19px]' : 'text-[22px]')}>
          {business.name}
        </h1>
        <p className="text-[14px] text-quiet">Objednávka online</p>
      </div>
    </div>
  )

  if (embedded) {
    return (
      <div style={accentVars(business.color)} className="min-h-screen bg-ground">
        <main className="mx-auto flex w-full max-w-[560px] flex-col gap-6 px-4 pb-10 pt-5">
          {identity(true)}
          {flow}
        </main>
      </div>
    )
  }

  const steps = howItGoes(config.booking)

  return (
    <div style={accentVars(business.color)} className="min-h-screen bg-ground">
      <main className="mx-auto flex w-full max-w-[1040px] flex-col gap-6 px-4 pb-16 pt-6 sm:px-6 sm:pt-10">
        <header className="lg:hidden">{identity(true)}</header>

        <div className="grid items-start gap-6 lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-10">
          <aside className="hidden flex-col gap-6 lg:sticky lg:top-10 lg:flex">
            {identity(false)}

            <section aria-labelledby="postup" className="flex flex-col gap-3 border-t border-navy-100 pt-6">
              <h2 id="postup" className="font-num text-xs font-medium uppercase tracking-[0.12em] text-quiet">
                Jak to probíhá
              </h2>
              <ol className="flex flex-col gap-3">
                {steps.map((text, i) => (
                  <li key={text} className="grid grid-cols-[28px_minmax(0,1fr)] items-start gap-3 text-[15px] leading-snug text-ink">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-navy-50 font-num text-[12px] font-medium text-navy-700">
                      {i + 1}
                    </span>
                    <span className="pt-1">{text}</span>
                  </li>
                ))}
              </ol>
            </section>

            <ul className="flex flex-col gap-2 border-t border-navy-100 pt-6 text-[14px] leading-snug text-quiet" aria-label="Co platí">
              <li>Bez registrace a bez hesla.</li>
              <li>Vaše údaje uvidí jen {business.name}.</li>
              <li>Termín je domluvený, až ho firma potvrdí.</li>
            </ul>
          </aside>

          <section aria-label="Objednávka" className="min-w-0 rounded-panel border border-navy-100 bg-surface p-5 sm:p-8">
            {flow}
          </section>
        </div>

        <footer className="mt-auto flex items-center gap-2 pt-4 text-[13px] text-quiet">
          <Logo size={18} />
          <span>Poptávky přes ZakazIQ</span>
        </footer>
      </main>
    </div>
  )
}
