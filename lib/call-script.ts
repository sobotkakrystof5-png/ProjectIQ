// Opora pro telefonát v Hovorech: 4 krátké kroky, aby hovor neutekl.
// Texty, které se říkají klientovi, jsou tady — uprav je klidně vlastními slovy.
// Čísla se doplňují jen ze skutečných dat (Dokončené, Hodnocení, ceník), nikdy vymyšlená.

import { WEB_PACKAGES } from './vizeon-pricing'

export type CallStats = {
  /** Dokončené klientské zakázky (completed_projects, project_type = 'client') */
  completedProjects: number
  /** Počet vyplněných dotazníků spokojenosti */
  surveyCount: number
  /** Průměr všech šesti hodnocení napříč dotazníky (1–5), null když žádný není */
  avgRating: number | null
  /** Nejnovější reference se souhlasem se zveřejněním */
  reference: { text: string; author: string | null } | null
}

export type CallStepKey = 'statistiky' | 'predstaveni' | 'nabidka' | 'poptavka'

export type CallStep = {
  key: CallStepKey
  label: string
  /** Kolik vteřin má krok zabrat — součet je cíl celého pitche */
  seconds: number
  /** Věty, které se říkají nahlas, v tomhle pořadí */
  say: string[]
  /** Max. 2 krátké připomínky pro tebe */
  tips: string[]
}

const czNumber = (n: number, digits = 0) =>
  new Intl.NumberFormat('cs-CZ', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n)

export const formatPrice = (n: number) => `${czNumber(n)} Kč`

/** „1 hotovou zakázku", „3 hotové zakázky", „12 hotových zakázek" (4. pád po „mám za sebou") */
export function completedPhrase(n: number): string {
  if (n === 1) return '1 hotovou zakázku'
  if (n >= 2 && n <= 4) return `${n} hotové zakázky`
  return `${czNumber(n)} hotových zakázek`
}

export function buildCallScript(stats: CallStats): CallStep[] {
  const cheapest = WEB_PACKAGES[0]
  const full = WEB_PACKAGES[WEB_PACKAGES.length - 1]

  const proof: string[] = []
  if (stats.completedProjects > 0) proof.push(`Mám za sebou ${completedPhrase(stats.completedProjects)}`)
  if (stats.avgRating !== null) {
    proof.push(`${proof.length ? 'a klienti' : 'Klienti'} hodnotí spolupráci průměrně ${czNumber(stats.avgRating, 1)} z 5`)
  }

  const intro = 'Dobrý den, tady Kryštof Sobotka z VIZEONu.'

  return [
    {
      key: 'statistiky',
      label: 'Statistiky',
      seconds: 10,
      say: proof.length ? [intro, `${proof.join(' ')}.`] : [intro],
      tips: proof.length
        ? ['Číslo řekni hned, ještě než se zeptají, kdo volá.']
        : ['Čísla se doplní sama, až přibudou Dokončené zakázky a Hodnocení.'],
    },
    {
      key: 'predstaveni',
      label: 'Představení',
      seconds: 20,
      say: [
        'Dělám weby pro živnostníky a menší firmy, od návrhu až po spuštění.',
        'Volám, protože vám web může přivést víc zákazníků. Máte teď dvě minuty?',
      ],
      tips: ['Jedna věta o tobě, pak hned otázka.', 'Nemají čas? Zeptej se, kdy můžeš zavolat znovu.'],
    },
    {
      key: 'nabidka',
      label: 'Nabídka',
      seconds: 30,
      say: [
        `Web vám připravím na klíč. ${cheapest.label} stojí ${formatPrice(cheapest.price)}, kompletní ${full.label} ${formatPrice(full.price)}.`,
      ],
      tips: ['Cenu řekni na rovinu.', 'Ptají se na detaily? Pošli ukázky e-mailem, nevysvětluj to do telefonu.'],
    },
    {
      key: 'poptavka',
      label: 'Poptávka',
      seconds: 30,
      say: [
        'Máte už web? Co by vám měl hlavně přinést?',
        'Pošlu vám na e-mail ukázky své práce. Kdy se vám hodí krátký další hovor?',
      ],
      tips: ['Odpověď si hned zapiš do poznámky.', 'Domluv přesný den a čas dalšího hovoru.'],
    },
  ]
}

export const totalSeconds = (steps: CallStep[]) => steps.reduce((sum, s) => sum + s.seconds, 0)

/** 75 → „1:15" */
export function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}
