import { Check } from 'lucide-react'
import { LiveDot, LoyaltyCard, Logo } from '@/components/ws/brand'
import { cn } from '@/lib/ws/utils'
import { CONNECT_SLUG } from './content'
import { Reveal } from './reveal'
import { SectionHead } from './section-head'

/**
 * Blok 2 ze 4, Představení (R-081). Odpověď na „Poznáváte se?“ z bloku Statistiky.
 * Jedna sevřená sekce místo pěti (Proč to řešit, Co to umí, Jak to funguje, Funkce,
 * Napojení). Kalendář s poptávkou ukazuje úvod, tady se neopakuje; sekce ukazuje
 * jen to, co v úvodu není: odkud poptávka přijde, co zůstane u zákaznice a peníze.
 * Velikost kapitol podle důležitosti, každá s výřezem skutečného rozhraní (Ukázka,
 * fiktivní údaje stejné jako v úvodu). Výřezy jsou aria-hidden, text vedle říká totéž.
 */

/** Cesty podle R-016 (objednávací stránka /r, widget /embed), doména R-030. */
const CONNECT_WAYS = [
  { label: 'Odkaz nebo QR kód', code: `zakaziq.cz/r/${CONNECT_SLUG}` },
  { label: 'Jeden řádek do webu', code: `<script src="https://www.zakaziq.cz/embed/${CONNECT_SLUG}.js"></script>` },
  { label: 'Web postavený v Claude Code', code: '„napoj formulář na ZakazIQ“' },
] as const

const ORDER_FIELDS = [
  { label: 'Služba', options: ['Střih', 'Barvení + střih', 'Konzultace'], value: 'Barvení + střih' },
  { label: 'Den', options: ['Pá 9. 10.', 'So 10. 10.', 'Po 12. 10.'], value: 'Pá 9. 10.' },
  { label: 'Čas', options: ['9:00', '10:30', '13:00'], value: '9:00' },
] as const

const MONTHS = [
  { label: 'kvě', height: 42 },
  { label: 'čvn', height: 58 },
  { label: 'čvc', height: 50 },
  { label: 'srp', height: 66 },
  { label: 'zář', height: 61 },
  { label: 'říj', height: 84 },
] as const

const TAX_STEPS = [
  { title: 'Příjmy za rok', done: true },
  { title: 'Výdaje', done: true },
  { title: 'Odhad daně', done: true },
  { title: 'Termín přiznání, připomínka 7 dní předem', done: false },
] as const

function Sample({ dark = false, children = 'Ukázka' }: { dark?: boolean; children?: React.ReactNode }) {
  return <p className={cn('text-[14px]', dark ? 'text-navy-300' : 'text-quiet')}>{children}</p>
}

/** Pět míst ze Statistik v jedné kartě. Fiktivní den, proto ukázka. */
function OnePlaceCard({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn('rounded-panel bg-surface p-6 text-ink shadow-[0_24px_60px_-28px_rgb(var(--navy-950)/0.45)]', className)}
    >
      <div className="flex items-center justify-between gap-3">
        <Logo size={28} wordmark />
        <span className="text-[14px] text-quiet">Ukázka · dnes</span>
      </div>
      <ul className="mt-5 space-y-3 text-[15px] leading-snug">
        <li className="flex items-center gap-3">
          <LiveDot label="Nová poptávka" />
          <span>
            <span className="font-semibold">2 nové poptávky</span> z webu čekají na potvrzení
          </span>
        </li>
        <li className="flex items-center gap-3">
          <span className="h-2 w-2 shrink-0 rounded-full bg-navy-700" />
          <span>
            <span className="font-semibold">5 termínů</span>, všechny potvrzené
          </span>
        </li>
        <li className="flex items-center gap-3">
          <span className="h-2 w-2 shrink-0 rounded-full bg-navy-700" />
          <span>
            Faktura <span className="font-num font-semibold">2 400 Kč</span> odeslaná, splatnost hlídáme
          </span>
        </li>
        <li className="flex items-center gap-3">
          <span className="h-2 w-2 shrink-0 rounded-full bg-navy-700" />
          <span>Připomínka Tereze Malé odešla sama</span>
        </li>
      </ul>
    </div>
  )
}

function Pill({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex min-h-9 items-center whitespace-nowrap rounded-full border px-3 text-[15px]',
        active ? 'border-navy-700 bg-navy-700 text-white' : 'border-navy-200 text-navy-700',
      )}
    >
      {children}
    </span>
  )
}

/** Objednávka tak, jak ji vyplní zákaznice. Stejná stránka se otevře z odkazu i z QR kódu. */
function OrderPage() {
  return (
    <div aria-hidden className="min-w-0">
      <Sample>Ukázka · objednávka na webu salonu</Sample>
      <div className="mt-4 flex flex-col gap-4">
        {ORDER_FIELDS.map((field) => (
          <div key={field.label}>
            <p className="text-[14px] font-medium text-quiet">{field.label}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {field.options.map((option) => (
                <Pill key={option} active={option === field.value}>
                  {option}
                </Pill>
              ))}
            </div>
          </div>
        ))}
        <div>
          <p className="text-[14px] font-medium text-quiet">Jméno</p>
          <p className="mt-2 flex min-h-11 items-center rounded-chip border border-navy-200 px-3 text-[15px]">Tereza Malá</p>
        </div>
        <span className="inline-flex min-h-11 items-center self-start rounded-full bg-navy-700 px-5 text-[15px] font-semibold text-white">
          Odeslat poptávku
        </span>
      </div>
    </div>
  )
}

function ConnectWays() {
  return (
    <div aria-hidden className="min-w-0 rounded-box bg-navy-950 p-5 text-navy-100 sm:p-6">
      <p className="text-[14px] text-navy-300">Tři cesty, jak poptávka přijde</p>
      <ol className="mt-4 flex flex-col gap-5">
        {CONNECT_WAYS.map((way) => (
          <li key={way.label} className="flex flex-col gap-1">
            <span className="text-[14px] text-navy-200">{way.label}</span>
            <code className="break-all font-num text-[13px] leading-relaxed text-white">{way.code}</code>
          </li>
        ))}
      </ol>
    </div>
  )
}

function CustomerCard() {
  return (
    <div aria-hidden className="flex min-w-0 flex-col gap-4">
      <Sample>Ukázka · karta zákaznice</Sample>
      <div className="flex items-center gap-3 rounded-chip bg-surface p-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-navy-100 text-[15px] font-semibold text-navy-900">
          TM
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">Tereza Malá</p>
          <p className="text-[14px] text-quiet">Stálá · naposledy 9. 10. barvení + střih</p>
        </div>
      </div>
      <LoyaltyCard customer="Tereza Malá" stamps={4} total={5} reward="střih zdarma" business="Věrnostní karta" />
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-chip bg-surface p-3">
        <div className="min-w-0">
          <p className="text-[14px] text-quiet">Komu napsat · Spící</p>
          <p className="font-semibold">Jana, naposledy 14. 4.</p>
        </div>
        <span className="inline-flex min-h-10 shrink-0 items-center whitespace-nowrap rounded-full bg-navy-700 px-4 text-[14px] font-semibold text-white">
          Připravit zprávu
        </span>
      </div>
    </div>
  )
}

function IncomePanel() {
  return (
    <div aria-hidden className="flex h-full min-w-0 flex-col rounded-box bg-surface p-5 text-ink sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <span className="font-semibold">Příjmy · říjen 2026</span>
        <span className="text-[14px] text-quiet">Ukázka</span>
      </div>
      <p className="mt-5 font-num text-[40px] leading-none tracking-[-0.04em] sm:text-[48px]">
        1 850 <span className="text-xl text-quiet">Kč</span>
      </p>
      <p className="mt-2 text-[15px] text-quiet">Tereza Malá · barvení + střih · zaplaceno</p>
      <div className="mt-auto pt-6">
        <div className="flex h-[96px] items-end gap-2 border-b border-navy-200">
          {MONTHS.map((month, i) => (
            <span
              key={month.label}
              className={cn('block flex-1 rounded-t-tiny', i === MONTHS.length - 1 ? 'bg-navy-700' : 'bg-navy-200')}
              style={{ height: `${month.height}%` }}
            />
          ))}
        </div>
        <div className="mt-2 flex gap-2 font-num text-[13px] text-quiet">
          {MONTHS.map((month) => (
            <span key={month.label} className="flex-1 text-center">
              {month.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

function InvoicePanel() {
  return (
    <div aria-hidden className="flex h-full min-w-0 flex-col gap-3 rounded-box bg-surface p-5 text-ink sm:p-6">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">Faktura</span>
        <span className="whitespace-nowrap font-num text-[14px] text-quiet">2026-000042</span>
      </div>
      <p className="text-[14px] text-quiet">Tereza Malá · Ukázka</p>
      <dl className="flex flex-col gap-2 text-[15px]">
        <div className="flex justify-between gap-3">
          <dt>Barvení</dt>
          <dd className="whitespace-nowrap font-num">1 350 Kč</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Střih</dt>
          <dd className="whitespace-nowrap font-num">500 Kč</dd>
        </div>
      </dl>
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-navy-100 pt-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-navy-50 px-3 py-1 text-[14px] text-navy-800">
          <Check size={14} strokeWidth={1.5} />
          Zaplaceno
        </span>
        <span className="whitespace-nowrap font-num text-[18px] font-semibold">1 850 Kč</span>
      </div>
    </div>
  )
}

function TaxPanel() {
  return (
    <div aria-hidden className="flex h-full min-w-0 flex-col gap-4 rounded-box bg-navy-800 p-5 text-white sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <span className="font-semibold">Daně 2026</span>
        <span className="text-[14px] text-navy-300">Ukázka</span>
      </div>
      <ul className="flex flex-col gap-3">
        {TAX_STEPS.map((step) => (
          <li key={step.title} className="flex items-start gap-3 text-[15px] leading-snug">
            <span
              className={cn(
                'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full',
                step.done ? 'bg-navy-300 text-navy-950' : 'border border-dashed border-navy-400',
              )}
            >
              {step.done && <Check size={12} strokeWidth={1.5} />}
            </span>
            {step.title}
          </li>
        ))}
      </ul>
      <p className="mt-auto border-t border-navy-700 pt-3 text-[14px] leading-snug text-navy-200">
        Podklady a odhad, ne daňové přiznání.
      </p>
    </div>
  )
}

const chapterTitle = 'text-[26px] font-semibold leading-[1.1] tracking-[-0.025em] sm:text-[32px]'

export function Introduction() {
  return (
    <section id="funkce" aria-labelledby="funkce-title" className="mx-auto max-w-[1200px] px-5 pt-[72px] sm:px-7 md:pt-[120px]">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:items-center lg:gap-12">
        <div className="lg:col-span-7">
          <SectionHead id="funkce-title" title="Představujeme ZakazIQ." />
          <p className="mt-6 max-w-[560px] text-[19px] leading-relaxed text-ink">
            Poptávky, kalendář, zákazníci, faktury, e-maily i přehled peněz na jednom místě. Když o firmě víte všechno,
            zbývá vám čas na práci, která vydělává.
          </p>
          <p className="mt-4 max-w-[560px] text-[17px] leading-relaxed text-quiet">
            Jak se poptávka zařadí do kalendáře, jste viděli v úvodu. Tady je, odkud přijde a co vám po ní zůstane.
          </p>
        </div>
        <OnePlaceCard className="w-full max-w-[400px] lg:col-span-5 lg:justify-self-end" />
      </div>

      <div className="mt-12 grid grid-cols-1 gap-3 md:mt-16 lg:grid-cols-12 lg:gap-4">
        <Reveal as="article" className="rounded-slab bg-surface p-5 text-ink sm:p-8 lg:col-span-7">
          <div id="ukazka-objednavka" className="scroll-mt-28">
            <h3 className={chapterTitle}>Zákazník se objedná sám.</h3>
            <p className="mt-3 max-w-[52ch] text-[17px] leading-relaxed text-quiet">
              Na vašem webu, přes odkaz nebo z QR kódu na pultu si vybere službu a čas. Když web nemáte, dostanete
              stránku pro objednání. Web vám taky postavím a rovnou napojím.
            </p>
          </div>
          <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] sm:items-start">
            <OrderPage />
            <ConnectWays />
          </div>
        </Reveal>

        <Reveal as="article" delay={90} className="rounded-slab bg-navy-50 p-5 text-ink sm:p-8 lg:col-span-5">
          <div id="ukazka-zakaznik" className="scroll-mt-28">
            <h3 className={chapterTitle}>Každá zákaznice má svou kartu.</h3>
            <p className="mt-3 max-w-[44ch] text-[17px] leading-relaxed text-quiet">
              Vidíte, kdy u vás byla a kolik razítek jí chybí do odměny. Razítko přibude po zaplacené návštěvě, jak si
              věrnost nastavíte. Když dlouho nepřijde, najdete ji v seznamu Komu napsat.
            </p>
          </div>
          <div className="mt-8">
            <CustomerCard />
          </div>
        </Reveal>

        <Reveal as="article" className="rounded-slab bg-navy-950 p-5 text-white sm:p-8 md:p-10 lg:col-span-12">
          <div id="ukazka-penize" className="grid scroll-mt-28 grid-cols-1 gap-4 lg:grid-cols-12 lg:items-end lg:gap-12">
            <h3 className={cn(chapterTitle, 'lg:col-span-5')}>Příjmy vidíte průběžně.</h3>
            <p className="max-w-[52ch] text-[17px] leading-relaxed text-navy-200 lg:col-span-7">
              Platbu zapíšete k návštěvě a hned je v přehledu měsíce. Samotné potvrzení termínu příjmy nezvýší. Vedle
              najdete faktury, výdaje a odhad daní a jednou za měsíc vám přehled přijde e-mailem.
            </p>
          </div>
          <div className="mt-8 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-12 lg:gap-4">
            <div className="md:col-span-2 lg:col-span-5">
              <IncomePanel />
            </div>
            <div className="lg:col-span-4">
              <InvoicePanel />
            </div>
            <div className="lg:col-span-3">
              <TaxPanel />
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
