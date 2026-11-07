import { AccentHeading } from '@/components/ws/brand'
import { Footer } from './footer'
import { Header } from './header'
import { LEGAL_VERSION } from './legal'

/**
 * Právní stránka: nadpis, verze, úvod a číslované oddíly (R-079). Texty
 * připravil agent podle skutečného chování aplikace, schvaluje je Kryštof.
 */
export function LegalPage({ title, intro, children }: { title: string; intro: React.ReactNode; children: React.ReactNode }) {
  return (
    <>
      <Header variant="page" />
      <main id="obsah" className="mx-auto max-w-[760px] px-5 pb-20 pt-16 sm:px-7 md:pt-24">
        <AccentHeading as="h1" size="section">
          {title}
        </AccentHeading>
        <p className="mt-4 text-sm text-quiet">Verze ze dne {LEGAL_VERSION}</p>
        <div className="mt-8 flex flex-col gap-3 text-[17px] leading-relaxed text-ink">{intro}</div>
        <ol className="mt-12 flex list-decimal flex-col gap-10 pl-6 marker:text-[22px] marker:font-semibold">{children}</ol>
      </main>
      <Footer />
    </>
  )
}

/** Jeden oddíl. Číslo dává seznam, kotva `id` slouží k odkazům mezi texty. */
export function LegalSection({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <li id={id} className="scroll-mt-28 pl-1">
      <h2 className="text-[22px] font-semibold leading-snug tracking-[-0.01em] text-ink">{title}</h2>
      <div className="mt-3 flex flex-col gap-3 text-[17px] leading-relaxed text-ink">{children}</div>
    </li>
  )
}

/** Odrážky uvnitř oddílu. */
export function LegalList({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="flex list-disc flex-col gap-2 pl-5 marker:text-quiet">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  )
}

/** Seznam služeb, které s údaji pracují: název a místo nahoře, role pod nimi (vejde se i na telefon). */
export function ProcessorList({ items }: { items: readonly { name: string; role: string; where: string }[] }) {
  return (
    <ul className="overflow-hidden rounded-box border border-navy-100 bg-surface">
      {items.map((p) => (
        <li key={`${p.name}-${p.role}`} className="border-t border-navy-100 px-4 py-3 text-[15px] first:border-t-0 sm:px-5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4">
            <span className="font-semibold">{p.name}</span>
            <span className="text-quiet">{p.where}</span>
          </div>
          <p className="mt-0.5">{p.role}</p>
        </li>
      ))}
    </ul>
  )
}

/** Odkaz v textu. */
export function LegalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} className="text-navy-700 underline underline-offset-4 hover:text-navy-900">
      {children}
    </a>
  )
}
