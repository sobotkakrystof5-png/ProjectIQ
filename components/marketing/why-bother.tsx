import { ArrowDown } from 'lucide-react'
import { cn } from '@/lib/ws/utils'
import { Reveal } from './reveal'
import { SectionHead } from './section-head'

type Artifact = 'request' | 'move' | 'payment' | 'sleeping'

interface Moment {
  /** Kdy se to stane: čas, nebo „Za půl roku“. */
  when: string
  problem: { title: string; today: string }
  /** Co udělá ZakazIQ, jedna nebo dvě věty. */
  solution: string
  artifact: Artifact
}

// Každé řešení je existující funkce (docs/landing/PROJECT-BRIEF.md § 4.3), nic navíc.
// Jedna zákaznice (Tereza Malá) prochází dnem: poptávka, přesun, platba. Jana je ukázka spící zákaznice.
const MOMENTS: Moment[] = [
  {
    when: '10:40',
    problem: {
      title: 'Máte plné ruce a telefon pípne.',
      today: '„Máte v pátek volno?“ Odpovíte až večer. Zákaznice mezitím může jít jinam.',
    },
    solution: 'Zákaznice si vybere čas sama. Vy potvrdíte jedním klikem, až budete mít chvilku.',
    artifact: 'request',
  },
  {
    when: '14:05',
    problem: {
      title: 'Zákazník volá, že to nestihne.',
      today: 'Přepisujete termín v diáři a doufáte, že nekoliduje s jiným.',
    },
    solution: 'Termín posunete. Obsazený čas kalendář nepustí a zákazník dostane e-mail se změnou.',
    artifact: 'move',
  },
  {
    when: '19:30',
    problem: {
      title: 'Večer počítáte, kdo zaplatil.',
      today: 'Něco přišlo na účet, něco v hotovosti. Faktury máte v tabulce.',
    },
    solution: 'Platba se zapíše k návštěvě a objeví se v přehledu měsíce. Odhad daní vidíte během roku.',
    artifact: 'payment',
  },
  {
    when: 'Za půl roku',
    problem: {
      title: 'Stálá zákaznice přestala chodit.',
      today: 'Všimnete si, až ji potkáte na ulici.',
    },
    solution: 'ZakazIQ ji zařadí mezi Spící. Zprávu pro ni máte připravenou v panelu Komu napsat.',
    artifact: 'sleeping',
  },
]

/** Kousek skutečného rozhraní k řešení. Jen ilustrace (text vedle říká totéž), proto aria-hidden. */
function ArtifactView({ kind }: { kind: Artifact }) {
  switch (kind) {
    case 'request':
      return (
        <div className="rounded-panel border-[1.5px] border-dashed border-signal-line bg-signal-bg p-4 text-signal-ink sm:p-5">
          <div className="flex items-center justify-between gap-3 font-num text-[12px] font-medium uppercase tracking-[0.08em]">
            <span>Nová poptávka</span>
            <span className="normal-case tracking-normal">pá 9:00–10:30</span>
          </div>
          <p className="mt-2 text-[20px] font-semibold leading-tight">Tereza Malá</p>
          <p className="text-[15px] leading-snug">barvení + střih · z webu</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="inline-flex min-h-11 items-center rounded-full bg-navy-700 px-5 text-[15px] font-semibold text-white">
              Potvrdit termín
            </span>
            <span className="inline-flex min-h-11 items-center rounded-full border border-signal-line px-5 text-[15px] font-medium">
              Jiný čas
            </span>
          </div>
        </div>
      )
    case 'move':
      return (
        <div className="rounded-box bg-ground p-4 text-ink">
          <div className="flex flex-col gap-2">
            <div className="rounded-chip border border-dashed border-navy-300 px-3.5 py-2.5 text-quiet">
              <s className="font-num text-[14px] decoration-quiet">9:00–10:30</s>
              <p className="text-[14px]">Tereza Malá</p>
            </div>
            <ArrowDown aria-hidden size={16} strokeWidth={1.5} className="mx-auto text-navy-500" />
            <div className="rounded-chip border-l-[3px] border-navy-700 bg-navy-100 px-3.5 py-2.5 text-navy-900">
              <p className="font-num text-[14px]">11:00–12:30</p>
              <p className="text-[16px] font-semibold leading-snug">Tereza Malá</p>
              <p className="text-[14px]">E-mail se změnou odeslán</p>
            </div>
          </div>
        </div>
      )
    case 'payment':
      return (
        <div className="rounded-box bg-ground p-4 text-ink">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[14px] font-medium text-quiet">Příjmy · říjen</span>
            <span className="rounded-full bg-navy-100 px-3 py-1 font-num text-[12px] text-navy-800">Zaplaceno</span>
          </div>
          <p className="mt-3 font-num text-[32px] leading-none tracking-[-0.03em]">
            1 850 <span className="text-[16px] text-quiet">Kč</span>
          </p>
          <p className="mt-3 text-[16px] font-semibold">Tereza Malá</p>
          <p className="text-[14px] text-quiet">barvení + střih</p>
        </div>
      )
    case 'sleeping':
      return (
        <div className="rounded-box bg-ground p-4 text-ink">
          <div className="flex items-center justify-between gap-3">
            <span className="rounded-full bg-surface px-3 py-1 font-num text-[12px] uppercase text-navy-700">Spící</span>
            <span className="font-num text-[12px] text-quiet">naposledy 14. 4.</span>
          </div>
          <p className="mt-3 text-[18px] font-semibold leading-tight">Jana</p>
          <p className="text-[14px] text-quiet">Dřív chodila každý měsíc.</p>
          <span className="mt-4 inline-flex min-h-11 items-center rounded-full bg-navy-700 px-5 text-[15px] font-semibold text-white">
            Připravit zprávu
          </span>
        </div>
      )
  }
}

/**
 * 01 Proč to řešit (R-031, R-057): čtyři chvíle jednoho dne. První (10:40) je hlavní
 * moment ve velké tmavé kartě, zbylé tři jdou vedle sebe. Jeden nájezd (`Reveal`), bez smyček.
 */
export function WhyBother() {
  const [first, ...rest] = MOMENTS
  return (
    <section id="proc" aria-labelledby="proc-title" className="mx-auto max-w-[1200px] px-5 pt-[56px] sm:px-7 md:pt-[96px]">
      <SectionHead id="proc-title" title="Den, kdy máte plné ruce." />
      <p className="mt-5 max-w-[620px] text-[17px] leading-relaxed text-quiet">
        Firmu vedete z telefonu a z diáře a většinou to stačí. Tady jsou chvíle, kdy ne. Kvůli nim jsem ZakazIQ postavil.
      </p>

      <ol className="mt-8 grid gap-4 md:mt-10 lg:grid-cols-3">
        <Reveal as="li" className="rounded-slab bg-navy-950 p-6 text-white sm:p-10 lg:col-span-3 lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-center lg:gap-14">
          <div className="min-w-0">
            <p className="font-num text-[36px] leading-none text-navy-300 sm:text-[44px]">{first.when}</p>
            <h3 className="mt-5 text-[26px] font-semibold leading-tight tracking-[-0.02em] sm:text-[32px]">{first.problem.title}</h3>
            <p className="mt-2 max-w-[46ch] text-[17px] leading-relaxed text-navy-200">{first.problem.today}</p>
            <p className="mt-6 max-w-[44ch] border-t border-navy-800 pt-5 text-[18px] font-semibold leading-snug text-white">
              {first.solution}
            </p>
          </div>
          <div className="mt-8 lg:mt-0">
            <p className="mb-3 text-[14px] font-medium text-navy-300">Ukázka</p>
            <div aria-hidden>
              <ArtifactView kind={first.artifact} />
            </div>
          </div>
        </Reveal>

        {rest.map((m, i) => (
          <Reveal as="li" key={m.when} delay={i * 90} className="flex flex-col rounded-slab border border-navy-100 bg-surface p-6 sm:p-8">
            <p className={cn('font-num leading-none text-navy-500', m.when.length > 5 ? 'text-[18px]' : 'text-[32px]')}>{m.when}</p>
            <h3 className="mt-5 text-[22px] font-semibold leading-tight tracking-[-0.02em]">{m.problem.title}</h3>
            <p className="mt-2 text-[16px] leading-relaxed text-quiet">{m.problem.today}</p>
            <p className="mt-5 border-t border-navy-100 pt-4 text-[16px] font-semibold leading-snug text-ink">{m.solution}</p>
            <div className="mt-5 flex flex-1 flex-col justify-end">
              <p className="mb-2 text-[13px] font-medium text-quiet">Ukázka</p>
              <div aria-hidden>
                <ArtifactView kind={m.artifact} />
              </div>
            </div>
          </Reveal>
        ))}
      </ol>
    </section>
  )
}
