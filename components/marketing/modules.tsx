import { cn } from '@/lib/ws/utils'
import { MODULES } from './content'
import { Reveal } from './reveal'
import { SectionHead } from './section-head'

// Odstíny dlaždic jako v LP-D — mřížka má působit jako skládačka, ne tabulka.
// `a`/`b` = dílky znaku 2×2, které si při hoveru prohodí odstín (třídy musí být celé kvůli Tailwindu).
const SHADES = [
  { tile: 'bg-navy-700 text-white', sub: 'text-navy-200', a: 'bg-white group-hover:bg-navy-400', b: 'bg-navy-400 group-hover:bg-white' },
  { tile: 'bg-navy-100 text-ink', sub: 'text-quiet', a: 'bg-navy-700 group-hover:bg-navy-300', b: 'bg-navy-300 group-hover:bg-navy-700' },
  { tile: 'border border-navy-100 bg-surface text-ink', sub: 'text-quiet', a: 'bg-navy-700 group-hover:bg-navy-200', b: 'bg-navy-200 group-hover:bg-navy-700' },
  { tile: 'bg-navy-100 text-ink', sub: 'text-quiet', a: 'bg-navy-700 group-hover:bg-navy-300', b: 'bg-navy-300 group-hover:bg-navy-700' },
  { tile: 'bg-navy-800 text-white', sub: 'text-navy-200', a: 'bg-white group-hover:bg-navy-500', b: 'bg-navy-500 group-hover:bg-white' },
  { tile: 'border border-navy-100 bg-surface text-ink', sub: 'text-quiet', a: 'bg-navy-700 group-hover:bg-navy-200', b: 'bg-navy-200 group-hover:bg-navy-700' },
]

/** Znak 2×2 v rohu dlaždice; při hoveru dva dílky prohodí odstín („složí se"). */
function SwapGlyph({ a, b }: { a: string; b: string }) {
  return (
    <span aria-hidden className="grid grid-cols-2 gap-[3px]">
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className={cn('block h-[7px] w-[7px] rounded-[2px] transition-colors duration-300 ease-zq', i === 0 || i === 3 ? a : b)}
        />
      ))}
    </span>
  )
}

/** 04 Funkce — „Skládejte si to po dílcích" (brief § 4.6). */
export function Modules() {
  return (
    <section id="funkce-seznam" aria-labelledby="moduly-title" className="mx-auto max-w-[1200px] px-5 pt-[72px] sm:px-7 md:pt-[120px]">
      <SectionHead id="moduly-title" number="04" label="Funkce · všechny v ceně" title="Skládejte si to" accent="po dílcích." />
      <p className="mt-6 max-w-[560px] text-[17px] leading-relaxed text-quiet">
        Zapnete si jen to, co potřebujete. Vypnutá funkce zmizí z menu a data zůstanou.
      </p>

      <ul className="mt-12 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        {MODULES.map((m, j) => {
          const shade = SHADES[(j * 2 + Math.floor(j / 3)) % SHADES.length]
          return (
            <Reveal as="li" key={m.n} delay={(j % 3) * 90}>
              <div
                className={cn(
                  'group flex h-full min-h-[150px] flex-col justify-between gap-6 rounded-[22px] p-5 transition-transform duration-300 ease-zq hover:-translate-y-0.5 sm:p-6',
                  shade.tile,
                )}
              >
                <div className="flex items-start justify-between">
                  <span className="font-num text-xs opacity-70">{m.n}</span>
                  <SwapGlyph a={shade.a} b={shade.b} />
                </div>
                <div>
                  <h3 className="text-[17px] font-semibold leading-tight tracking-[-0.01em] sm:text-lg">{m.title}</h3>
                  <p className={cn('mt-1 text-sm', shade.sub)}>{m.text}</p>
                </div>
              </div>
            </Reveal>
          )
        })}
      </ul>
    </section>
  )
}
