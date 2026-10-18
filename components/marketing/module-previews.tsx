import { Check } from 'lucide-react'
import { LoyaltyCard } from '@/components/ws/brand'
import { cn } from '@/lib/ws/utils'

// Ukázky na kartách 04 Funkce: zmenšené kusy rozhraní aplikace s fiktivními údaji.
// Jsou dekorativní (aria-hidden), význam říká text na kartě. Bez smyček a náhodných hodnot.

function Sample({ dark = false }: { dark?: boolean }) {
  return (
    <span className={cn('font-num text-[12px] uppercase tracking-[0.08em]', dark ? 'text-navy-300' : 'text-quiet')}>
      Ukázka
    </span>
  )
}

const REQUEST_ROWS = [
  { title: 'Střih · pátek 9:00', state: 'Potvrzeno' },
  { title: 'Konzultace · středa 14:00', state: 'Potvrzeno' },
  { title: 'Oprava zámku · pondělí', state: 'Vyřízeno' },
]

/** 01 Poptávky: nová poptávka z webu s potvrzením jedním klikem (tmavá karta). */
export function RequestsPreview() {
  return (
    <div aria-hidden className="flex flex-1 flex-col gap-2.5">
      <Sample dark />
      <div className="rounded-chip border-[1.5px] border-dashed border-signal-line bg-signal-bg p-4 text-signal-ink">
        <div className="flex items-center justify-between gap-3 font-num text-[12px] font-medium uppercase tracking-[0.08em]">
          <span>Nová poptávka</span>
          <span className="normal-case tracking-normal">dnes 10:40</span>
        </div>
        <p className="mt-2 text-[18px] font-semibold leading-snug">Tereza Malá</p>
        <p className="text-[15px] leading-snug opacity-80">Barvení + střih · z webu</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="inline-flex min-h-10 items-center rounded-full bg-navy-700 px-4 text-[15px] font-semibold text-white">
            Potvrdit termín
          </span>
          <span className="inline-flex min-h-10 items-center rounded-full border border-signal-line px-4 text-[15px] font-medium">
            Jiný čas
          </span>
        </div>
      </div>
      {REQUEST_ROWS.map((row) => (
        <div
          key={row.title}
          className="flex items-center justify-between gap-3 rounded-chip bg-navy-900 px-4 py-3 text-[15px] text-navy-100"
        >
          <span className="min-w-0 truncate">{row.title}</span>
          <span className="shrink-0 rounded-full bg-navy-800 px-2.5 py-0.5 text-[13px] text-navy-200">{row.state}</span>
        </div>
      ))}
    </div>
  )
}

const HOURS = [9, 10, 11, 12, 13, 14, 15, 16]
const HOUR_PX = 40
const DAYS = ['Po', 'Út', 'St', 'Čt', 'Pá']

type SlotKind = 'confirmed' | 'new' | 'block'
const SLOTS: { day: number; from: number; hours: number; kind: SlotKind; title: string }[] = [
  { day: 0, from: 9, hours: 2, kind: 'confirmed', title: 'Střih' },
  { day: 1, from: 12, hours: 1, kind: 'block', title: 'Oběd' },
  { day: 2, from: 10, hours: 1, kind: 'new', title: 'Nová' },
  { day: 3, from: 14, hours: 2, kind: 'confirmed', title: 'Barva' },
  { day: 4, from: 11, hours: 2, kind: 'confirmed', title: 'Střih' },
]

const SLOT_CLASS: Record<SlotKind, string> = {
  confirmed: 'border-l-[3px] border-navy-700 bg-navy-100 text-navy-900',
  new: 'border-[1.5px] border-dashed border-signal-line bg-signal-bg text-signal-ink',
  block: 'bg-navy-50 text-quiet',
}

/** 02 Kalendář: týden s potvrzeným termínem, blokací a čárkovanou novou poptávkou. */
export function CalendarPreview() {
  return (
    <div aria-hidden className="flex flex-1 flex-col gap-3">
      <Sample />
      <div className="grid grid-cols-[28px_repeat(5,minmax(0,1fr))] font-num text-[12px] uppercase text-quiet">
        <span />
        {DAYS.map((day) => (
          <span key={day} className="text-center">
            {day}
          </span>
        ))}
      </div>
      <div className="relative" style={{ height: HOURS.length * HOUR_PX }}>
        {HOURS.map((hour, i) => (
          <div key={hour} className="absolute inset-x-0 flex border-t border-navy-100" style={{ top: i * HOUR_PX }}>
            <span className="w-7 pt-0.5 font-num text-[11px] text-quiet">{hour}</span>
          </div>
        ))}
        <div className="absolute inset-y-0 left-7 right-0">
          {SLOTS.map((slot) => (
            <div
              key={`${slot.day}-${slot.from}`}
              className={cn('absolute overflow-hidden rounded-tiny px-1.5 py-1.5 leading-tight sm:px-2', SLOT_CLASS[slot.kind])}
              style={{
                left: `calc(${slot.day} * 20% + 2px)`,
                width: 'calc(20% - 4px)',
                top: (slot.from - HOURS[0]) * HOUR_PX + 2,
                height: slot.hours * HOUR_PX - 4,
              }}
            >
              <span className="block truncate text-[12px] font-semibold sm:text-[13px]">{slot.title}</span>
              {slot.hours >= 2 && <span className="block font-num text-[11px] opacity-80">{slot.from}:00</span>}
            </div>
          ))}
        </div>
      </div>
      <p className="text-[14px] leading-snug text-quiet">Nová poptávka se po potvrzení změní na termín.</p>
    </div>
  )
}

const SEGMENTS = [
  { label: 'Stálé', count: 12, bar: 'bg-navy-700' },
  { label: 'Nové', count: 4, bar: 'bg-navy-400' },
  { label: 'Spící', count: 3, bar: 'bg-navy-200' },
  { label: 'Jednorázové', count: 7, bar: 'bg-navy-100' },
]

/** 03 Zákazníci: karta zákaznice a skupiny podle návštěv. */
export function CustomersPreview() {
  return (
    <div aria-hidden className="flex flex-1 flex-col gap-4">
      <Sample />
      <div className="flex items-center gap-3 rounded-chip border border-navy-100 p-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-navy-100 text-[15px] font-semibold text-navy-900">
          TM
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">Tereza Malá</p>
          <p className="text-[14px] text-quiet">Stálá zákaznice · 6 návštěv</p>
        </div>
      </div>
      <div>
        <div className="flex h-3 gap-0.5 overflow-hidden rounded-full">
          {SEGMENTS.map((segment) => (
            <span key={segment.label} className={cn('h-full', segment.bar)} style={{ flexGrow: segment.count }} />
          ))}
        </div>
        <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[14px]">
          {SEGMENTS.map((segment) => (
            <li key={segment.label} className="flex items-center gap-2">
              <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', segment.bar)} />
              <span className="flex-1">{segment.label}</span>
              <span className="font-num text-quiet">{segment.count}</span>
            </li>
          ))}
        </ul>
      </div>
      <span className="mt-auto inline-flex min-h-10 w-fit items-center whitespace-nowrap rounded-full border border-navy-300 px-4 text-[14px] font-medium text-navy-900">
        Komu napsat
      </span>
    </div>
  )
}

/** 04 Věrnostní karty: razítka za návštěvy, odměna po naplnění. */
export function LoyaltyPreview() {
  return (
    <div aria-hidden className="flex flex-1 flex-col gap-4">
      <Sample />
      <LoyaltyCard customer="Tereza Malá" stamps={7} total={10} reward="Střih zdarma" business="Věrnostní karta" />
    </div>
  )
}

const JOB_COLUMNS = [
  { name: 'Nová', cards: ['Oprava zámku', 'Schůzka'] },
  { name: 'Rozpracováno', cards: ['Výměna vložky', 'Revize kotle'] },
  { name: 'Hotovo', cards: ['Oprava pračky'] },
]

/** 05 Zakázky: tabule podle stavů od přijetí po hotovo. */
export function JobsPreview() {
  return (
    <div aria-hidden className="flex flex-1 flex-col gap-3">
      <Sample />
      <div className="grid flex-1 grid-cols-[1fr_1.4fr_1fr] gap-2">
        {JOB_COLUMNS.map((column) => (
          <div key={column.name} className="flex min-w-0 flex-col gap-2 rounded-chip bg-navy-50 p-1.5">
            <p className="whitespace-nowrap font-num text-[11px] uppercase tracking-[0.04em] text-quiet">{column.name}</p>
            {column.cards.map((card) => (
              <div key={card} className="break-words rounded-tiny border border-navy-100 bg-surface p-2 text-[13px] font-medium leading-snug">
                {card}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

/** 06 Faktury: doklad s číslem, položkami, hlídáním splatnosti a částkou. */
export function InvoicePreview() {
  return (
    <div aria-hidden className="flex flex-1 flex-col gap-3">
      <Sample />
      <div className="flex flex-1 flex-col gap-3 rounded-chip border border-navy-100 bg-surface p-4">
        <div className="flex items-center justify-between gap-2 font-num text-[11px] uppercase tracking-[0.06em] text-quiet">
          <span>Faktura</span>
          <span className="whitespace-nowrap normal-case">2026-000042</span>
        </div>
        <p className="text-[13px] text-quiet">Tereza Malá</p>
        <dl className="flex flex-col gap-2 text-[14px]">
          <div className="flex justify-between gap-3">
            <dt>Barvení</dt>
            <dd className="whitespace-nowrap font-num">1 350 Kč</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>Střih</dt>
            <dd className="whitespace-nowrap font-num">500 Kč</dd>
          </div>
        </dl>
        <div className="mt-auto border-t border-navy-100 pt-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[14px] text-quiet">Celkem</span>
            <span className="whitespace-nowrap font-num text-[18px] font-semibold">1 850 Kč</span>
          </div>
          <span className="mt-3 inline-flex items-center whitespace-nowrap rounded-full border border-danger/40 px-2.5 py-0.5 text-[12px] font-medium text-danger">
            Po splatnosti
          </span>
        </div>
      </div>
    </div>
  )
}

const MONTHS = [
  { label: 'kvě', height: 42 },
  { label: 'čvn', height: 58 },
  { label: 'čvc', height: 50 },
  { label: 'srp', height: 66 },
  { label: 'zář', height: 61 },
  { label: 'říj', height: 84 },
]

/** 07 Příjmy a výdaje: sloupce měsíců, které vyrostou jednou při načtení. */
export function IncomePreview() {
  return (
    <div aria-hidden className="flex flex-1 flex-col gap-3">
      <Sample />
      <div className="flex h-[168px] items-end gap-2 border-b border-navy-200">
        {MONTHS.map((month, i) => (
          <div key={month.label} className="flex h-full flex-1 flex-col justify-end">
            <span
              className={cn(
                'block w-full origin-bottom rounded-t-tiny motion-safe:animate-zq-grow',
                i === MONTHS.length - 1 ? 'bg-navy-700' : 'bg-navy-200',
              )}
              style={{ height: `${month.height}%`, animationDelay: `${i * 120}ms` }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-2 font-num text-[11px] uppercase text-quiet">
        {MONTHS.map((month) => (
          <span key={month.label} className="flex-1 text-center">
            {month.label}
          </span>
        ))}
      </div>
      <p className="text-[14px] leading-snug text-quiet">Graf za 6 nebo 12 měsíců, po měnách.</p>
    </div>
  )
}

const TAX_STEPS = [
  { title: 'Příjmy za rok', note: 'Z přijatých plateb', done: true },
  { title: 'Výdaje', note: 'Zapsané náklady', done: true },
  { title: 'Odhad daně', note: 'Orientační výpočet', done: true },
  { title: 'Termín přiznání', note: 'Připomínka 7 dní předem', done: false },
]

/** 08 Daně: podklady pro daně z příjmů a připomínka termínu (tmavá karta). */
export function TaxPreview() {
  return (
    <div aria-hidden className="flex flex-1 flex-col gap-3">
      <Sample dark />
      <ul className="flex flex-1 flex-col gap-3">
        {TAX_STEPS.map((step) => (
          <li key={step.title} className="flex items-start gap-3">
            <span
              className={cn(
                'mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full',
                step.done ? 'bg-navy-300 text-navy-950' : 'border border-dashed border-navy-400',
              )}
            >
              {step.done && <Check size={14} strokeWidth={1.5} />}
            </span>
            <span className="min-w-0">
              <span className="block text-[15px] font-semibold leading-snug">{step.title}</span>
              <span className="block text-[14px] leading-snug text-navy-200">{step.note}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="border-t border-navy-800 pt-3 text-[13px] leading-snug text-navy-300">
        Podklady a odhad, ne daňové přiznání.
      </p>
    </div>
  )
}

/** 09 E-maily zákazníkům: potvrzení termínu s odkazem do kalendáře. */
export function EmailPreview() {
  return (
    <div aria-hidden className="flex flex-1 flex-col gap-3">
      <Sample />
      <div className="flex flex-1 flex-col rounded-chip border border-navy-100 bg-surface p-4">
        <p className="font-num text-[11px] uppercase tracking-[0.06em] text-quiet">Od: Kadeřnictví Lenka</p>
        <p className="mt-2 text-[15px] font-semibold leading-snug">Termín je potvrzený</p>
        <p className="mt-2 text-[14px] leading-relaxed text-quiet">
          Dobrý den, těšíme se na vás v úterý v 9:00. Termín si můžete přidat do kalendáře.
        </p>
        <span className="mt-auto inline-flex min-h-10 w-fit items-center whitespace-nowrap rounded-full bg-navy-700 px-4 text-[14px] font-semibold text-white">
          Přidat do kalendáře
        </span>
      </div>
    </div>
  )
}
