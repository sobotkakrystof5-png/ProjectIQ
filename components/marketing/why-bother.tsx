import { ArrowDown } from 'lucide-react'
import { cn } from '@/lib/ws/utils'
import { Reveal } from './reveal'
import { SectionHead } from './section-head'

type Artifact = 'request' | 'move' | 'payment' | 'sleeping'
type Tone = 'dark' | 'light' | 'soft'

interface Moment {
  /** Kdy se to stane: čas, nebo „Za půl roku“. */
  when: string
  problem: { title: string; today: string }
  /** Co udělá ZakazIQ, jedna nebo dvě věty. */
  solution: string
  artifact: Artifact
  tone: Tone
}

// Každé řešení je existující funkce (docs/landing/PROJECT-BRIEF.md § 4.3), nic navíc.
// Jedna zákaznice (Tereza Malá) prochází dnem: poptávka, přesun, platba. Jana je ukázka spící zákaznice.
const MOMENTS: Moment[] = [
  {
    when: '10:40',
    problem: {
      title: 'Stříháte a telefon pípne.',
      today: '„Máte v pátek volno?“ Odpovíte až večer. Zákaznice mezitím může jít jinam.',
    },
    solution: 'Zákaznice si vybere čas sama. Vy potvrdíte jedním klikem, až budete mít chvilku.',
    artifact: 'request',
    tone: 'dark',
  },
  {
    when: '14:05',
    problem: {
      title: 'Zákazník volá, že to nestihne.',
      today: 'Přepisujete termín v diáři a doufáte, že nekoliduje s jiným.',
    },
    solution: 'Termín posunete. Obsazený čas kalendář nepustí a zákazník dostane e-mail se změnou.',
    artifact: 'move',
    tone: 'light',
  },
  {
    when: '19:30',
    problem: {
      title: 'Večer počítáte, kdo zaplatil.',
      today: 'Něco přišlo na účet, něco v hotovosti. Faktury máte v tabulce a na konci roku to skládáte znovu.',
    },
    solution: 'Platba se zapíše k návštěvě a objeví se v přehledu měsíce. Odhad daní vidíte během roku.',
    artifact: 'payment',
    tone: 'soft',
  },
  {
    when: 'Za půl roku',
    problem: {
      title: 'Stálá zákaznice přestala chodit.',
      today: 'Všimnete si, až ji potkáte na ulici.',
    },
    solution: 'ZakazIQ ji zařadí mezi Spící. Zprávu pro ni máte připravenou v panelu Komu napsat.',
    artifact: 'sleeping',
    tone: 'light',
  },
]

const TONE: Record<Tone, { band: string; time: string; label: string; title: string; text: string }> = {
  dark: { band: 'bg-navy-950 text-white', time: 'text-navy-300', label: 'text-navy-300', title: 'text-white', text: 'text-navy-200' },
  light: { band: 'bg-surface text-ink', time: 'text-navy-500', label: 'text-quiet', title: 'text-ink', text: 'text-quiet' },
  soft: { band: 'bg-navy-50 text-ink', time: 'text-navy-500', label: 'text-quiet', title: 'text-ink', text: 'text-quiet' },
}

const caption = 'text-[14px] font-medium'

/** Kousek skutečného rozhraní k řešení. Jen ilustrace (text vedle říká totéž), proto aria-hidden. */
function ArtifactView({ kind }: { kind: Artifact }) {
  switch (kind) {
    case 'request':
      return (
        <div className="rounded-panel border-[1.5px] border-dashed border-signal-line bg-signal-bg p-4 text-signal-ink">
          <div className="flex items-center justify-between gap-3 font-num text-[13px] font-medium uppercase tracking-[0.08em]">
            <span>Nová poptávka</span>
            <span className="normal-case tracking-normal">pá 9:00–10:30</span>
          </div>
          <p className="mt-2 text-[20px] font-semibold leading-tight">Tereza Malá</p>
          <p className="text-[15px] leading-snug">barvení + střih · z webu</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="inline-flex min-h-11 items-center rounded-full bg-navy-700 px-5 text-[16px] font-semibold text-white">
              Potvrdit termín
            </span>
            <span className="inline-flex min-h-11 items-center rounded-full border border-signal-line px-5 text-[16px] font-medium">
              Jiný čas
            </span>
          </div>
        </div>
      )
    case 'move':
      return (
        <div className="bg-ground p-4 text-ink">
          <p className={cn(caption, 'text-quiet')}>Pátek · přesunuto</p>
          <div className="mt-4 flex flex-col gap-2">
            <div className="rounded-chip border border-dashed border-navy-300 px-4 py-3 text-quiet">
              <s className="font-num text-[15px] decoration-quiet">9:00–10:30</s>
              <p className="text-[15px]">Tereza Malá</p>
            </div>
            <ArrowDown aria-hidden size={16} strokeWidth={1.5} className="mx-auto text-navy-500" />
            <div className="rounded-chip border-l-[3px] border-navy-700 bg-navy-100 px-4 py-3 text-navy-900">
              <p className="font-num text-[15px]">11:00–12:30</p>
              <p className="text-[18px] font-semibold leading-snug">Tereza Malá</p>
              <p className="text-[15px]">barvení + střih</p>
            </div>
          </div>
        </div>
      )
    case 'payment':
      return (
        <div className="bg-surface p-4 text-ink">
          <div className="flex items-center justify-between gap-3">
            <span className={cn(caption, 'text-quiet')}>Příjmy · říjen</span>
            <span className="rounded-full bg-navy-50 px-3 py-1 font-num text-[13px] text-navy-700">Zaplaceno</span>
          </div>
          <p className="mt-4 font-num text-[36px] leading-none tracking-[-0.03em]">
            1 850 <span className="text-[18px] text-quiet">Kč</span>
          </p>
          <p className="mt-3 text-[17px] font-semibold">Tereza Malá</p>
          <p className="text-[15px] text-quiet">barvení + střih</p>
        </div>
      )
    case 'sleeping':
      return (
        <div className="bg-navy-50 p-4 text-ink">
          <div className="flex items-center justify-between gap-3">
            <span className="rounded-full bg-surface px-3 py-1 font-num text-[13px] uppercase text-navy-700">Spící</span>
            <span className="font-num text-[13px] text-quiet">naposledy 14. 4.</span>
          </div>
          <p className="mt-3 text-[20px] font-semibold leading-tight">Jana</p>
          <p className="text-[15px] text-quiet">Dřív chodila každý měsíc.</p>
          <span className="mt-4 inline-flex min-h-11 items-center rounded-full bg-navy-700 px-5 text-[16px] font-semibold text-white">
            Připravit zprávu
          </span>
        </div>
      )
  }
}

/**
 * 01 Proč to řešit (R-031, přepracováno 2026-10-17 podle R-057): čtyři chvíle jednoho dne jako pásy.
 * Vlevo čas a problem, vpravo řešení s výřezem skutečného rozhraní. Pás 10:40 je hlavní moment
 * (tmavý, s poptávkou ve signální barvě). Jeden jednorázový nájezd (`Reveal`), bez smyček.
 */
export function WhyBother() {
  return (
    <section id="proc" aria-labelledby="proc-title" className="mx-auto max-w-[1200px] px-5 pt-[56px] sm:px-7 md:pt-[96px]">
      <SectionHead id="proc-title" title="Den, kdy máte plné ruce." />
      <p className="mt-5 max-w-[620px] text-[17px] leading-relaxed text-quiet">
        Firmu vedete z telefonu a z diáře a většinou to stačí. Tady jsou chvíle, kdy ne. Kvůli nim jsem ZakazIQ postavil.
      </p>

      <ol className="mt-10 flex flex-col gap-1 md:mt-12">
        {MOMENTS.map((m) => {
          const t = TONE[m.tone]
          return (
            <Reveal
              as="li"
              key={m.when}
              className={cn(
                'grid gap-8 px-5 py-9 sm:px-8 md:py-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)] lg:items-center lg:gap-12',
                t.band,
              )}
            >
              <div className="flex min-w-0 flex-col">
                <p
                  className={cn(
                    'font-num leading-none',
                    m.when.length > 5 ? 'text-[20px]' : 'text-[36px]',
                    t.time,
                  )}
                >
                  {m.when}
                </p>
                <h3 className={cn('mt-5 text-[24px] font-semibold leading-tight tracking-[-0.02em] sm:text-[28px]', t.title)}>
                  {m.problem.title}
                </h3>
                <p className={cn('mt-2 max-w-[46ch] text-[17px] leading-relaxed', t.text)}>{m.problem.today}</p>
              </div>

              <div className="flex min-w-0 flex-col gap-4">
                <div>
                  <p className={cn(caption, t.label)}>Se ZakazIQ</p>
                  <p className={cn('mt-2 text-[18px] font-semibold leading-snug', t.title)}>{m.solution}</p>
                </div>
                <div className="w-full max-w-[340px]">
                  <p className={cn(caption, 'mb-3', t.label)}>Ukázka</p>
                  <div aria-hidden>
                    <ArtifactView kind={m.artifact} />
                  </div>
                </div>
              </div>
            </Reveal>
          )
        })}
      </ol>
    </section>
  )
}
