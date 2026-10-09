'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { SignOutButton, useOrganizationList } from '@clerk/nextjs'
import { Biohazard, Car, Check, Droplets, HardHat, KeyRound, Scissors, Shapes, Sparkles, type LucideIcon } from 'lucide-react'
import { AccentHeading, Logo, SectionLabel } from '@/components/ws/brand'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createBusiness } from '@/app/w/novy/actions'
import type { FieldType, IndustryKey, StageType } from '@/lib/ws/templates/types'
import { cn } from '@/lib/ws/utils'

/** Co šablona oboru předvyplní — jen data pro náhled, sestavuje server (app/w/novy/page.tsx). */
export type IndustrySummary = {
  key: IndustryKey
  label: string
  /** Funkce zapnuté navíc, obyčejnými slovy („kalendář, zakázky“). */
  modules: string
  stages: { name: string; type: StageType }[]
  fields: { label: string; type: FieldType }[]
  services: string[]
}

const ICONS: Record<IndustryKey, LucideIcon> = {
  'kadernictvi-kosmetika': Scissors,
  zamecnictvi: KeyRound,
  studnarstvi: Droplets,
  azbest: Biohazard,
  autoservis: Car,
  uklid: Sparkles,
  stavba: HardHat,
  vlastni: Shapes,
}

const FIELD_TYPES: Record<FieldType, string> = {
  text: 'Text',
  choice: 'Volba',
  select: 'Výběr',
  number: 'Číslo',
  date: 'Datum',
  slot: 'Termín',
  contact: 'Kontakt',
  address: 'Adresa',
  file: 'Soubor',
}

const STEPS = [
  { n: '01', label: 'Název a obor' },
  { n: '02', label: 'Předplatné' },
]

/**
 * Průvodce Nový byznys, krok 1 ze 2 (rozložení podle mockupu C5, vzhled Dílky).
 * Vlevo název a obor, vpravo živý náhled toho, co šablona oboru připraví.
 * Krok 2 (platba) přidá S08 — do té doby „Pokračovat“ vede rovnou do aplikace.
 */
export function NewBusinessWizard({ industries }: { industries: IndustrySummary[] }) {
  const router = useRouter()
  const { setActive } = useOrganizationList()
  const [name, setName] = useState('')
  const [industry, setIndustry] = useState<IndustryKey | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const selected = industries.find((i) => i.key === industry) ?? null
  const nameMissing = error !== null && name.trim().length < 2

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (name.trim().length < 2 || !industry) {
      setError(!industry && name.trim().length >= 2 ? 'Vyberte prosím obor.' : 'Doplňte prosím název byznysu a vyberte obor.')
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await createBusiness({ name, industry })
      if (!result.ok) {
        setError(result.error)
        return
      }
      try {
        await setActive?.({ organization: result.data.orgId })
        router.replace('/w')
        router.refresh()
      } catch {
        setError('Byznys je založený, jen se nepodařilo otevřít. Načtěte prosím stránku znovu.')
      }
    })
  }

  return (
    <div className="min-h-screen bg-ground text-ink">
      <header className="bg-navy-950 text-white">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3 sm:px-8">
          <div className="flex items-center gap-3">
            <Logo size={32} onDark />
            <span className="text-[15px] font-semibold">Nový byznys</span>
          </div>
          <ol className="order-3 flex w-full flex-wrap gap-1.5 sm:order-none sm:w-auto" aria-label="Kroky">
            {STEPS.map((s, i) => (
              <li
                key={s.n}
                aria-current={i === 0 ? 'step' : undefined}
                className={cn(
                  'inline-flex min-h-[34px] items-center gap-1.5 rounded-full px-3 text-[13px]',
                  i === 0 ? 'bg-white font-semibold text-navy-950' : 'border border-navy-800 text-navy-300',
                )}
              >
                <span className="font-num text-[11px]">{s.n}</span>
                {s.label}
              </li>
            ))}
          </ol>
          <SignOutButton redirectUrl="/">
            <button
              type="button"
              className="min-h-[44px] rounded-full px-3 text-[13px] text-navy-300 transition-colors duration-200 ease-zq hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-300"
            >
              Odhlásit se
            </button>
          </SignOutButton>
        </div>
      </header>

      <form
        onSubmit={submit}
        noValidate
        className="mx-auto flex max-w-[1240px] flex-wrap items-start gap-8 px-4 pb-12 pt-8 sm:px-8 lg:pt-10"
      >
        <section aria-labelledby="novy-nadpis" className="flex min-w-0 flex-[3_1_520px] flex-col gap-6">
          <div className="flex flex-col gap-2">
            <SectionLabel>Krok 1 ze 2</SectionLabel>
            <AccentHeading id="novy-nadpis" accent="váš byznys?">
              Čím se zabývá
            </AccentHeading>
            <p className="max-w-[540px] text-[15px] leading-relaxed text-quiet">
              Podle oboru připravíme služby, kolonky poptávky a stavy zakázek. Nezačínáte s prázdnou tabulkou
              a všechno můžete později upravit.
            </p>
          </div>

          <div className="flex max-w-[480px] flex-col gap-2">
            <Label htmlFor="novy-nazev">Název byznysu</Label>
            <Input
              id="novy-nazev"
              name="name"
              autoComplete="organization"
              maxLength={80}
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setError(null)
              }}
              placeholder="Třeba Kadeřnictví U Lenky"
              aria-invalid={nameMissing || undefined}
              className="h-12 text-base"
            />
          </div>

          <fieldset className="flex flex-col gap-3">
            <legend className="mb-3 text-sm font-medium text-ink">Obor</legend>
            <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
              {industries.map((i) => {
                const Icon = ICONS[i.key]
                const isOn = i.key === industry
                return (
                  <label
                    key={i.key}
                    className={cn(
                      'relative flex min-h-[104px] cursor-pointer flex-col items-start gap-1.5 rounded-box border p-3.5 sm:min-h-[112px] sm:p-4 transition-colors duration-200 ease-zq has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-navy-500 has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-ground',
                      isOn
                        ? 'border-navy-700 bg-navy-700 text-white'
                        : 'border-navy-100 bg-surface text-ink hover:border-navy-300',
                    )}
                  >
                    <input
                      type="radio"
                      name="industry"
                      value={i.key}
                      checked={isOn}
                      onChange={() => {
                        setIndustry(i.key)
                        setError(null)
                      }}
                      className="sr-only"
                    />
                    <Icon aria-hidden size={22} strokeWidth={1.5} />
                    <span className="text-[15px] font-semibold leading-snug">{i.label}</span>
                    <span className={cn('text-xs leading-snug', isOn ? 'text-navy-200' : 'text-quiet')}>{i.modules}</span>
                    {isOn && <Check aria-hidden size={18} strokeWidth={1.5} className="absolute right-3 top-3" />}
                  </label>
                )
              })}
            </div>
          </fieldset>
        </section>

        <aside
          aria-label="Co připravíme"
          className="flex min-w-0 flex-[2_1_360px] flex-col gap-6 rounded-panel border border-navy-100 bg-surface p-6 lg:sticky lg:top-6"
        >
          <div className="flex flex-col gap-1">
            <SectionLabel>{selected ? `Připravíme · ${selected.label}` : 'Připravíme'}</SectionLabel>
            <h2 className="text-[22px] font-semibold tracking-[-0.02em]">Takhle začnete</h2>
          </div>

          {selected ? (
            <Preview industry={selected} />
          ) : (
            <p className="text-[15px] text-quiet">Vyberte obor a uvidíte, co pro vás připravíme.</p>
          )}

          <div className="flex flex-col gap-3 border-t border-navy-100 pt-5">
            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
            <Button type="submit" size="lg" disabled={pending} className="w-full">
              {pending ? 'Zakládám…' : 'Pokračovat'}
            </Button>
            <p className="text-center text-xs text-quiet">14 dní zdarma, bez platební karty.</p>
          </div>
        </aside>
      </form>
    </div>
  )
}

function Preview({ industry }: { industry: IndustrySummary }) {
  const stages = industry.stages.filter((s) => s.type !== 'cancelled')
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h3 className="text-[13px] font-semibold">Stavy zakázky</h3>
        <ul className="flex flex-wrap gap-1.5">
          {stages.map((s) => (
            <li
              key={s.name}
              className={cn(
                'inline-flex min-h-[30px] items-center rounded-full px-3 text-xs font-medium',
                s.type === 'new' && 'border-[1.5px] border-dashed border-signal-line bg-signal-bg text-signal-ink',
                s.type === 'in_progress' && 'bg-navy-50 text-ink',
                (s.type === 'done' || s.type === 'paid') && 'bg-navy-100 text-navy-900',
              )}
            >
              {s.name}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col">
        <h3 className="mb-1 text-[13px] font-semibold">Kolonky poptávky</h3>
        {industry.fields.length > 0 ? (
          <ul>
            {industry.fields.map((f) => (
              <li key={f.label} className="flex justify-between gap-3 border-t border-navy-100 py-2 text-[13px]">
                <span>{f.label}</span>
                <span className="font-num text-[11px] text-quiet">{FIELD_TYPES[f.type]}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-quiet">Jméno a kontakt. Další kolonky si přidáte v Nastavení.</p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <h3 className="text-[13px] font-semibold">Služby</h3>
        <p className="text-[13px] text-quiet">
          {industry.services.length > 0
            ? `${industry.services.join(' · ')}. Ceny doplníte sami.`
            : 'Služby si přidáte v Nastavení.'}
        </p>
      </div>
    </div>
  )
}
