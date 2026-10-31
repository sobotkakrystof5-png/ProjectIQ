'use client'

import { useState, type ComponentType } from 'react'
import { cn } from '@/lib/ws/utils'
import { CTA_LABEL, MODULES, ROUTES } from './content'
import {
  CalendarPreview,
  CustomersPreview,
  EmailPreview,
  IncomePreview,
  InvoicePreview,
  JobsPreview,
  LoyaltyPreview,
  RequestsPreview,
  TaxPreview,
} from './module-previews'
import { Reveal } from './reveal'
import { SectionHead } from './section-head'

// 04 Funkce, „Skládejte si to po dílcích". Každá karta je dílek: ukazuje kus aplikace
// a přepínač ukáže, co se stane, když funkci vypnete. Pravidla přepínačů jsou stejná
// jako v Nastavení › Funkce (lib/ws/settings.ts): Daně potřebují Příjmy.

type SwitchKey = 'calendar' | 'jobs' | 'loyalty' | 'invoices' | 'finance' | 'taxes'
type Toggles = Record<SwitchKey, boolean>
type Tone = 'dark' | 'light' | 'soft'
type Control = { kind: 'switch'; key: SwitchKey } | { kind: 'locked' } | { kind: 'settings'; where: string }
type Layout = { span: string; tone: Tone; control: Control; Preview: ComponentType }

// Rozvržení jako skládačka: dvě velké karty nahoře, tři střední, čtyři malé.
// Tmavé karty jsou dvě (Poptávky a Daně), ať nejsou všechny stejné.
const LAYOUT: Record<(typeof MODULES)[number]['n'], Layout> = {
  '01': { span: 'sm:col-span-2 lg:col-span-5', tone: 'dark', control: { kind: 'locked' }, Preview: RequestsPreview },
  '02': { span: 'sm:col-span-2 lg:col-span-7', tone: 'light', control: { kind: 'switch', key: 'calendar' }, Preview: CalendarPreview },
  '03': { span: 'lg:col-span-6 xl:col-span-4', tone: 'light', control: { kind: 'locked' }, Preview: CustomersPreview },
  '04': { span: 'lg:col-span-6 xl:col-span-4', tone: 'soft', control: { kind: 'switch', key: 'loyalty' }, Preview: LoyaltyPreview },
  '05': { span: 'sm:col-span-2 lg:col-span-12 xl:col-span-4', tone: 'light', control: { kind: 'switch', key: 'jobs' }, Preview: JobsPreview },
  '06': { span: 'lg:col-span-6 xl:col-span-3', tone: 'light', control: { kind: 'switch', key: 'invoices' }, Preview: InvoicePreview },
  '07': { span: 'lg:col-span-6 xl:col-span-3', tone: 'soft', control: { kind: 'switch', key: 'finance' }, Preview: IncomePreview },
  '08': { span: 'lg:col-span-6 xl:col-span-3', tone: 'dark', control: { kind: 'switch', key: 'taxes' }, Preview: TaxPreview },
  '09': { span: 'lg:col-span-6 xl:col-span-3', tone: 'light', control: { kind: 'settings', where: 'V nastavení' }, Preview: EmailPreview },
}

const TILES = MODULES.map((module) => ({ ...module, ...LAYOUT[module.n] }))
type ModuleTile = (typeof TILES)[number]

const ALL_ON: Toggles = { calendar: true, jobs: true, loyalty: true, invoices: true, finance: true, taxes: true }

/** Stejná pravidla jako při ukládání modulů: Daně nejdou bez Příjmů, vypnutí Příjmů vypne Daně. */
function applyRules(state: Toggles, key: SwitchKey, value: boolean): Toggles {
  const next = { ...state, [key]: value }
  if (value && key === 'taxes') next.finance = true
  if (!value && key === 'finance') next.taxes = false
  return next
}

const TONE: Record<Tone, { surface: string; sub: string; muted: string }> = {
  dark: { surface: 'bg-navy-950 text-white', sub: 'text-navy-200', muted: 'text-navy-300' },
  light: { surface: 'bg-surface text-ink', sub: 'text-quiet', muted: 'text-quiet' },
  soft: { surface: 'bg-navy-50 text-ink', sub: 'text-quiet', muted: 'text-quiet' },
}
const OFF_TONE = { surface: 'bg-navy-100 text-ink', sub: 'text-quiet', muted: 'text-quiet' }

/** Dílek znaku: plný, když je funkce zapnutá; prázdný a čárkovaný, když je vypnutá. */
function Dilek({ on, dark }: { on: boolean; dark: boolean }) {
  return (
    <span aria-hidden className="grid grid-cols-2 gap-[3px]">
      {[0, 1, 2, 3].map((i) => {
        const strong = i === 0 || i === 3
        const fill = dark ? (strong ? 'bg-white' : 'bg-navy-400') : strong ? 'bg-navy-700' : 'bg-navy-300'
        return (
          <span
            key={i}
            className={cn(
              'block h-2.5 w-2.5 rounded-[3px] transition-colors duration-300 ease-zq',
              on ? fill : 'border border-dashed border-navy-300',
            )}
          />
        )
      })}
    </span>
  )
}

function Switch({
  id,
  checked,
  dark,
  onChange,
}: {
  id: string
  checked: boolean
  dark: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={id}
      onClick={() => onChange(!checked)}
      className={cn(
        'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
        dark ? 'focus-visible:outline-navy-300' : 'focus-visible:outline-navy-500',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'relative inline-block h-6 w-10 rounded-full transition-colors duration-300 ease-zq',
          checked && (dark ? 'bg-navy-300' : 'bg-navy-700'),
          !checked && (dark ? 'bg-navy-800' : 'bg-navy-100 ring-1 ring-inset ring-navy-300'),
        )}
      >
        <span
          className={cn(
            'absolute left-[3px] top-[3px] h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform duration-300 ease-zq',
            checked && 'translate-x-4',
            checked && dark && 'bg-navy-950',
          )}
        />
      </span>
    </button>
  )
}

function OffSlot() {
  return (
    <div className="flex min-h-[180px] flex-1 flex-col justify-center gap-2 py-3">
      <p className="font-semibold">Funkce je vypnutá</p>
      <p className="text-[15px] leading-relaxed text-quiet">Z menu zmizí, data zůstanou. Kdykoli ji můžete zapnout zpět.</p>
    </div>
  )
}

function ModuleCard({
  tile,
  on,
  onToggle,
}: {
  tile: ModuleTile
  on: boolean
  onToggle: (value: boolean) => void
}) {
  const titleId = `modul-${tile.n}`
  const dark = on && tile.tone === 'dark'
  const tone = on ? TONE[tile.tone] : OFF_TONE
  const { Preview } = tile
  return (
    <div
      className={cn(
        'flex h-full flex-col rounded-chip p-5 transition-colors duration-300 ease-zq sm:p-6',
        tone.surface,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Dilek on={on} dark={dark} />
        </div>
        {tile.control.kind === 'switch' ? (
          <Switch id={titleId} checked={on} dark={dark} onChange={onToggle} />
        ) : (
          <span className={cn('text-[13px]', tone.muted)}>
            {tile.control.kind === 'locked' ? 'Vždy v menu' : tile.control.where}
          </span>
        )}
      </div>
      <div className="mt-6">
        <h3 id={titleId} className="text-[20px] font-semibold leading-tight tracking-[-0.015em] sm:text-[22px]">
          {tile.title}
        </h3>
        <p className={cn('mt-1 text-[15px] leading-snug', tone.sub)}>{tile.text}</p>
      </div>
      <div className="mt-6 flex flex-1 flex-col">{on ? <Preview /> : <OffSlot />}</div>
    </div>
  )
}

/** 04 Funkce: „Skládejte si to po dílcích" (brief § 4.6, redesign R-057). */
export function Modules() {
  const [on, setOn] = useState<Toggles>(ALL_ON)
  const [note, setNote] = useState('')

  const isOn = (tile: ModuleTile) => (tile.control.kind === 'switch' ? on[tile.control.key] : true)

  function change(tile: ModuleTile, value: boolean) {
    if (tile.control.kind !== 'switch') return
    const key = tile.control.key
    setOn((state) => applyRules(state, key, value))
    setNote(`${tile.title}: ${value ? 'zapnuto' : 'vypnuto'}`)
  }

  return (
    <section id="funkce-seznam" aria-labelledby="moduly-title" className="mx-auto max-w-[1200px] px-5 pt-[56px] sm:px-7 md:pt-[96px]">
      <SectionHead id="moduly-title" number="04" label="Funkce · všechny v ceně" title="Skládejte si to" accent="po dílcích." />
      <p className="mt-6 max-w-[560px] text-[19px] leading-relaxed text-quiet">
        Zapněte si jen to, co potřebujete. Vypnutá funkce zmizí z menu a data zůstanou.
      </p>
      <p className="mt-3 max-w-[560px] text-base leading-relaxed text-quiet">
        Přepínače na kartách si můžete vyzkoušet. Je to jen ukázka, vaše nastavení se tím nemění.
      </p>

      <ul className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-12">
        {TILES.map((tile, j) => (
          <Reveal as="li" key={tile.n} delay={(j % 3) * 90} className={tile.span}>
            <ModuleCard tile={tile} on={isOn(tile)} onToggle={(value) => change(tile, value)} />
          </Reveal>
        ))}
      </ul>

      <p role="status" className="sr-only">
        {note}
      </p>

      <div className="mt-10 flex flex-col gap-5 border-t border-navy-100 pt-10 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-[46ch] text-lg leading-relaxed text-ink">
          Všechno, co tu vidíte, je v ceně. 14 dní zdarma, potom 249 Kč měsíčně.
        </p>
        <a
          href={ROUTES.signUp}
          className="inline-flex min-h-[54px] shrink-0 items-center justify-center rounded-full bg-navy-700 px-7 text-lg font-semibold text-white transition-colors duration-200 ease-zq hover:bg-navy-800"
        >
          {CTA_LABEL}
        </a>
      </div>
    </section>
  )
}
