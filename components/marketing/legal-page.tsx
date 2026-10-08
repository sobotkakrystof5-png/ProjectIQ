import { AccentHeading } from '@/components/ws/brand'
import { Footer } from './footer'
import { Header } from './header'

/**
 * Právní stránka se zástupným textem. Texty se negenerují — doplní je Kryštof
 * nebo právník nejpozději v S19 (R-023, brief § 8).
 */
export function LegalPage({ title, accent }: { title: string; accent?: string }) {
  return (
    <>
      <Header variant="page" />
      <main id="obsah" className="mx-auto max-w-[760px] px-5 pt-16 sm:px-7 md:pt-24">
        <AccentHeading as="h1" size="section" accent={accent}>
          {title}
        </AccentHeading>
        <p className="mt-8 text-[17px] leading-relaxed text-quiet">[DOPLNIT]</p>
      </main>
      <Footer />
    </>
  )
}
