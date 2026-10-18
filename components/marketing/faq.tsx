import { Plus } from 'lucide-react'
import { AccentHeading, SectionLabel } from '@/components/ws/brand'
import { FAQ, SUPPORT_LABEL, SUPPORT_MAILTO } from './content'

/** Odpověď s odkazem na e-mail podpory místo holé adresy. */
function Answer({ text }: { text: string }) {
  const parts = text.split(SUPPORT_LABEL)
  if (parts.length === 1) return <>{text}</>
  return (
    <>
      {parts[0]}
      <a href={SUPPORT_MAILTO} className="text-navy-700 underline underline-offset-4 hover:text-navy-900">
        {SUPPORT_LABEL}
      </a>
      {parts.slice(1).join(SUPPORT_LABEL)}
    </>
  )
}

/** 07 Dotazy — akordeon přes <details>, funguje i bez JavaScriptu a z klávesnice. */
export function Faq() {
  return (
    <section id="dotazy" aria-labelledby="dotazy-title" className="mx-auto max-w-[1200px] px-5 pt-[56px] sm:px-7 md:pt-[96px]">
      <div className="grid gap-10 lg:grid-cols-[4fr_7fr] lg:gap-16">
        <div className="flex flex-col gap-6 lg:sticky lg:top-28 lg:self-start">
          <SectionLabel number="07">Dotazy</SectionLabel>
          <AccentHeading id="dotazy-title" as="h2" size="section" accent="ptáte.">
            Na co se
          </AccentHeading>
        </div>

        <div className="border-t border-navy-100">
          {FAQ.map((item) => (
            <details key={item.q} className="group border-b border-navy-100">
              <summary className="flex min-h-[64px] cursor-pointer list-none items-center justify-between gap-6 py-4 text-[19px] font-semibold tracking-[-0.01em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-lg [&::-webkit-details-marker]:hidden">
                {item.q}
                <Plus
                  size={20}
                  strokeWidth={1.5}
                  aria-hidden
                  className="shrink-0 text-navy-500 transition-transform duration-200 ease-zq group-open:rotate-45"
                />
              </summary>
              <p className="max-w-[60ch] pb-6 text-lg leading-relaxed text-quiet">
                <Answer text={item.a} />
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
