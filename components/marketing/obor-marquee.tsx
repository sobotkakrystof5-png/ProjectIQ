import { TileGlyph } from '@/components/ws/brand'
import { OBORY } from './content'

function Row({ hidden = false }: { hidden?: boolean }) {
  return (
    <ul aria-hidden={hidden || undefined} aria-label={hidden ? undefined : 'Obory'} className="flex shrink-0 items-center">
      {OBORY.map((obor) => (
        <li key={obor} className="flex items-center gap-3 whitespace-nowrap px-6 text-[19px] font-medium tracking-[-0.01em] text-ink">
          <TileGlyph />
          {obor}
        </li>
      ))}
    </ul>
  )
}

/**
 * Běžící pás oborů (`zq-marquee`). Při hoveru stojí; při prefers-reduced-motion se nepohybuje
 * a obory se zalomí do řádků (druhá kopie pro plynulou smyčku je jen dekorace).
 */
export function OborMarquee() {
  return (
    <section aria-label="Obory" className="mx-auto mt-10 max-w-[1200px] md:mt-14">
      <div className="group relative overflow-hidden py-3 [mask-image:linear-gradient(90deg,transparent,black_8%,black_92%,transparent)] motion-reduce:[mask-image:none]">
        <div className="flex w-max animate-zq-marquee group-hover:[animation-play-state:paused] motion-reduce:w-auto motion-reduce:flex-wrap motion-reduce:justify-center">
          <Row />
          <div className="motion-reduce:hidden">
            <Row hidden />
          </div>
        </div>
      </div>
    </section>
  )
}
