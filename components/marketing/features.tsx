import { AccentHeading, LoyaltyCard, SectionLabel } from '@/components/ws/brand'

/** Dvě kapitoly pokračují stejnou ukázkovou návštěvou jako kalendář v úvodu. */
export function Features() {
  return (
    <section
      id="funkce"
      aria-labelledby="funkce-title"
      className="mx-auto max-w-[1200px] px-5 pt-[56px] sm:px-7 md:pt-[96px]"
    >
      <div className="mb-10 flex flex-col gap-4">
        <SectionLabel number="02">Co to umí</SectionLabel>
        <AccentHeading
          id="funkce-title"
          as="h2"
          size="section"
          accent="navazují další dílky."
        >
          Na jeden termín
        </AccentHeading>
      </div>

      <article
        id="ukazka-zakaznik"
        aria-labelledby="zakaznici-title"
        className="grid scroll-mt-28 items-center gap-10 py-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20 md:py-20"
      >
        <div>
          <SectionLabel>Zákazníci</SectionLabel>
          <h3
            id="zakaznici-title"
            className="mt-4 text-[32px] font-semibold leading-[1.1] tracking-[-0.03em] sm:text-[44px]"
          >
            Termín skončí.
            <br />
            <span className="font-accent font-normal text-navy-500">
              Zákaznice zůstává.
            </span>
          </h3>
          <p className="mt-5 max-w-[38ch] text-lg leading-relaxed text-quiet">
            Historie návštěv, poznámky i věrnostní karta patří k zákaznici. A
            když dlouho nepřišla, ZakazIQ vám řekne, komu napsat.
          </p>
          <a
            href="#ukazka-penize"
            className="mt-5 inline-flex min-h-11 items-center rounded-full text-base font-semibold text-navy-700 underline underline-offset-4"
          >
            A co po zaplacení?
          </a>
        </div>
        <div className="min-w-0">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-sm text-quiet">Karta zákaznice · ukázka</p>
              <p className="mt-1 text-2xl font-semibold tracking-[-0.02em]">Tereza Malá</p>
            </div>
          </div>
          <div className="grid items-start gap-8 pt-6 sm:grid-cols-[1fr_1.2fr]">
            <div>
              <p className="text-sm font-semibold text-quiet">Historie návštěv</p>
              <ol className="mt-5 space-y-6 text-base">
                <li>
                  <span className="font-num text-[13px] text-quiet">
                    9. 10. 2026 · 9:00
                  </span>
                  <p className="mt-1 font-semibold">Barvení + střih</p>
                  <p className="mt-1 text-quiet">Návštěva dokončena</p>
                </li>
                <li>
                  <span className="font-num text-[13px] text-quiet">
                    PŘEDCHOZÍ NÁVŠTĚVY
                  </span>
                  <p className="mt-1 text-quiet">Vše na jedné kartě</p>
                </li>
              </ol>
            </div>
            <div className="min-w-0">
              <LoyaltyCard
                customer="Tereza Malá"
                stamps={4}
                total={5}
                reward="střih zdarma"
                business="Věrnostní karta"
              />
              <div className="mt-5">
                <p className="text-sm font-semibold text-quiet">Kdy přibude razítko</p>
                <p className="mt-2 text-lg font-semibold leading-snug text-navy-900">
                  Po návštěvě a zaznamenání platby.
                </p>
                <p className="mt-1 text-base leading-relaxed text-quiet">
                  Podle nastavení věrnosti v byznysu. Nic se nepřidá samo.
                </p>
              </div>
            </div>
          </div>
        </div>
      </article>

      <article
        id="ukazka-penize"
        aria-labelledby="penize-title"
        className="overflow-hidden rounded-slab bg-navy-950 p-5 text-white sm:p-10 md:p-14"
      >
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <SectionLabel onDark>Peníze</SectionLabel>
            <h3
              id="penize-title"
              className="mt-4 text-[32px] font-semibold leading-[1.1] tracking-[-0.03em] sm:text-[44px]"
            >
              Zaplacená návštěva.
              <br />
              <span className="font-accent font-normal text-navy-300">
                Příjem v přehledu.
              </span>
            </h3>
          </div>
          <p className="max-w-[36ch] text-lg leading-relaxed text-navy-200">
            Faktury, příjmy, výdaje a odhad daní. Každý měsíc vám přijde přehled
            e-mailem.
          </p>
        </div>
        <div className="mt-10 overflow-hidden bg-surface text-ink">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-navy-100 p-5 sm:px-8">
            <span className="font-semibold">Příjmy · říjen 2026</span>
            <span className="font-num text-[13px] text-quiet">
              UKÁZKA · FIKTIVNÍ ČÁSTKY
            </span>
          </div>
          <div className="grid md:grid-cols-[1fr_1.25fr]">
            <div className="bg-navy-50 p-5 sm:p-8">
              <p className="text-base text-quiet">
                Zaznamenaná platba za návštěvu
              </p>
              <p className="mt-3 font-num text-[40px] tracking-[-0.04em] sm:text-[52px]">
                1 850 <span className="text-xl text-quiet">Kč</span>
              </p>
              <p className="mt-3 text-base text-quiet">
                Tereza Malá · barvení + střih
              </p>
              <p className="mt-6 max-w-[34ch] border-t border-navy-200 pt-4 text-sm leading-relaxed text-quiet">
                Příjem vzniká po zaznamenání platby. Samotné potvrzení termínu
                příjmy nezvýší.
              </p>
            </div>
            <div className="p-5 sm:p-8">
              <p className="font-num text-[13px] text-quiet">9. ŘÍJNA 2026</p>
              <dl className="mt-6 space-y-5 text-base">
                <div className="flex justify-between gap-3 border-b border-navy-100 pb-5">
                  <dt>Návštěva</dt>
                  <dd className="font-medium">Barvení + střih</dd>
                </div>
                <div className="flex justify-between gap-3 border-b border-navy-100 pb-5">
                  <dt>Zákaznice</dt>
                  <dd className="font-medium">Tereza Malá</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>Přijatá platba</dt>
                  <dd className="font-num">1 850 Kč</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </article>
    </section>
  )
}
