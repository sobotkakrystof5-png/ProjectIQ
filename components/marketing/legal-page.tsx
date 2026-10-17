import { AccentHeading } from '@/components/ws/brand'
import { Footer } from './footer'
import { Header } from './header'

/**
 * Právní stránka se zástupným textem. Texty se negenerují — doplní je Kryštof
 * nebo právník nejpozději v S19 (R-023, brief § 8). `facts` = jak se aplikace
 * skutečně chová (S18, R-054); právník je zapracuje do textu.
 */
export function LegalPage({ title, accent, facts }: { title: string; accent?: string; facts?: string[] }) {
  return (
    <>
      <Header variant="page" />
      <main id="obsah" className="mx-auto max-w-[760px] px-5 pt-16 sm:px-7 md:pt-24">
        <AccentHeading as="h1" size="section" accent={accent}>
          {title}
        </AccentHeading>
        {facts && facts.length > 0 && (
          <ul className="mt-8 flex list-disc flex-col gap-3 pl-5 text-[17px] leading-relaxed text-ink">
            {facts.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        )}
        <p className="mt-8 text-[17px] leading-relaxed text-quiet">[DOPLNIT]</p>
      </main>
      <Footer />
    </>
  )
}
