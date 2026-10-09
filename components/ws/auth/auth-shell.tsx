import Link from 'next/link'
import { AccentHeading, Logo, TileField } from '@/components/ws/brand'

/**
 * Rozložení přihlášení a registrace: vlevo tmavý panel s polem dílků (jen na
 * širokém displeji), vpravo formulář Clerku. Na telefonu jen logo a formulář.
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-ground">
      <div className="mx-auto grid min-h-screen max-w-[1200px] gap-8 px-4 py-6 sm:px-7 lg:grid-cols-[1fr_440px] lg:items-center lg:gap-16 lg:py-10">
        <section className="relative hidden h-full min-h-[560px] overflow-hidden rounded-slab bg-navy-950 p-10 lg:flex lg:flex-col lg:justify-between">
          <TileField cols={18} rows={18} className="-left-12 -top-12 p-4" />
          <Link href="/" className="relative inline-flex min-h-[44px] items-center self-start" aria-label="ZakazIQ, úvod">
            <Logo size={36} wordmark onDark />
          </Link>
          <AccentHeading as="h2" size="section" onDark accent="na svém místě." className="relative">
            Každá poptávka
            <br />
          </AccentHeading>
        </section>

        <div className="flex flex-col gap-6">
          <Link href="/" className="inline-flex min-h-[44px] items-center self-start lg:hidden" aria-label="ZakazIQ, úvod">
            <Logo size={32} wordmark />
          </Link>
          {children}
        </div>
      </div>
    </main>
  )
}
