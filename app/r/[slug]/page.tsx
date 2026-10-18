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
import type { OrderAvailability } from './actions'

// Objednávací stránka byznysu /r/[slug] (S11, R-016, plán „Odkaz, žádný kód“).
// Bez přihlášení, ve stylu Dílků s barvou byznysu. Neznámý nebo archivovaný
// slug = 404. Funguje i bez předplatného (poptávky se ukládají vždy, B5).

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

  return (
    <div style={accentVars(business.color)} className="min-h-screen bg-ground">
      <main className={`mx-auto flex w-full max-w-[560px] flex-col gap-8 px-4 pb-16 ${embedded ? 'pt-5' : 'pt-8 sm:pt-12'}`}>
        <header className="flex items-center gap-3">
          <span
            aria-hidden
            className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-chip bg-navy-700 text-[17px] font-semibold text-white"
          >
            {initials(business.name)}
          </span>
          <div className="flex min-w-0 flex-col">
            <h1 className="truncate text-[22px] font-semibold leading-tight tracking-[-0.02em] text-ink">{business.name}</h1>
            <p className="text-[14px] text-quiet">Objednávka online</p>
          </div>
        </header>

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

        {!embedded && <footer className="mt-auto flex items-center gap-2 pt-6 text-[13px] text-quiet">
          <Logo size={18} />
          <span>Poptávky přes ZakazIQ</span>
        </footer>}
      </main>
    </div>
  )
}
