import { Check } from 'lucide-react'
import { COMPARE } from './content'
import { SectionHead } from './section-head'

/**
 * Diář a telefon × ZakazIQ: pět situací vedle sebe. Žádná čísla ani sliby úspor,
 * jen popis toho, co se v aplikaci stane místo dnešního postupu.
 */
export function Compare() {
  return (
    <section id="srovnani" aria-labelledby="srovnani-title" className="mx-auto max-w-[1200px] px-5 pt-[56px] sm:px-7 md:pt-[96px]">
      <SectionHead id="srovnani-title" title="Co se změní oproti diáři a telefonu." />

      <div className="mt-8 overflow-hidden rounded-slab border border-navy-100 bg-surface md:mt-10">
        <div className="hidden grid-cols-[minmax(150px,1fr)_2fr_2fr] border-b border-navy-100 md:grid">
          <span className="px-6 py-4 font-num text-xs uppercase tracking-[0.12em] text-quiet">Situace</span>
          <span className="px-6 py-4 font-num text-xs uppercase tracking-[0.12em] text-quiet">Diář a telefon</span>
          <span className="bg-navy-50 px-6 py-4 font-num text-xs uppercase tracking-[0.12em] text-navy-700">Se ZakazIQ</span>
        </div>
        <ol className="divide-y divide-navy-100">
          {COMPARE.map((row) => (
            <li key={row.what} className="grid gap-x-6 gap-y-2 px-5 py-5 md:grid-cols-[minmax(150px,1fr)_2fr_2fr] md:gap-0 md:p-0">
              <p className="font-num text-[13px] font-medium uppercase tracking-[0.06em] text-ink md:px-6 md:py-5 md:text-[14px] md:normal-case md:tracking-normal md:font-semibold">
                {row.what}
              </p>
              <p className="text-[15px] leading-relaxed text-quiet md:px-6 md:py-5 md:text-[16px]">
                <span className="mr-2 font-num text-xs uppercase tracking-[0.08em] md:hidden">Dnes</span>
                {row.before}
              </p>
              <p className="flex items-start gap-3 rounded-chip bg-navy-50 px-4 py-3 text-[15px] font-medium leading-relaxed text-navy-900 md:rounded-none md:px-6 md:py-5 md:text-[16px]">
                <Check aria-hidden size={18} strokeWidth={1.5} className="mt-1 shrink-0 text-navy-700" />
                <span>{row.after}</span>
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
