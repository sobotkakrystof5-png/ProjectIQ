import type { Project, ProjectStatus } from '@/lib/types'

/**
 * Průvodka zakázky (AD11): osa od poptávky po hodnocení.
 *
 * Nečte nic nového — jen skládá, co v databázi stejně je. Proto je rozdělená
 * na dotaz (`journeySql`, jede v téže dávce jako hlavička detailu) a čistou
 * funkci (`buildJourney`), která jde testovat bez databáze.
 */

export const JOURNEY_STEPS = [
  'poptavka', 'hovor', 'nabidka', 'zaloha', 'prace', 'predano', 'faktura', 'zaplaceno', 'hodnoceni',
] as const
export type JourneyStepKey = (typeof JOURNEY_STEPS)[number]

/** Co průvodka potřebuje vědět mimo samotnou zakázku. */
export type JourneyFacts = {
  /** Termín v kalendáři nebo domluvená konzultace. */
  schuzka: boolean
  faktura: boolean
  fakturaZaplacena: boolean
  hodnoceni: boolean
}

export type JourneyStep = {
  key: JourneyStepKey
  label: string
  /** Krok je za námi. */
  done: boolean
  /** Co se stane, když se na něj klikne — jen u kroku, který je na řadě. */
  action?: { label: string; status: ProjectStatus } | { label: string; href: string }
  /** Vysvětlení pro krok, se kterým teď nejde nic dělat. */
  waiting?: string
}

const LABELS: Record<JourneyStepKey, string> = {
  poptavka: 'Poptávka',
  hovor: 'Hovor nebo schůzka',
  nabidka: 'Nabídka',
  zaloha: 'Záloha',
  prace: 'Práce',
  predano: 'Předáno',
  faktura: 'Faktura',
  zaplaceno: 'Zaplaceno',
  hodnoceni: 'Hodnocení',
}

/** Jeden dotaz do dávky detailu zakázky — vrátí jeden řádek se čtyřmi příznaky. */
export function journeySqlText(): string {
  return `SELECT
      EXISTS (SELECT 1 FROM calendar_events   WHERE project_id = $1)
      OR EXISTS (SELECT 1 FROM consultation_slots WHERE project_id = $1) AS schuzka,
      EXISTS (SELECT 1 FROM invoices WHERE project_id = $1) AS faktura,
      EXISTS (SELECT 1 FROM invoices WHERE project_id = $1 AND paid_on IS NOT NULL) AS faktura_zaplacena,
      EXISTS (SELECT 1 FROM project_surveys WHERE project_id = $1) AS hodnoceni`
}

/** Pořadí stavů — „práce" je splněná i tehdy, když je zakázka dál. */
const AFTER: Record<ProjectStatus, number> = { new: 0, in_progress: 1, review: 2, done: 3, paid: 4 }

export function buildJourney(
  project: Pick<Project, 'source' | 'status' | 'price' | 'paid' | 'deposit_amount' | 'deposit_paid' | 'closed_at'>,
  facts: JourneyFacts,
): JourneyStep[] {
  const stage = AFTER[project.status] ?? 0
  const maPoptavku = project.source !== null && project.source !== 'manual'
  const maCenu = project.price !== null && Number(project.price) > 0
  const chceZalohu = project.deposit_amount !== null && Number(project.deposit_amount) > 0

  const steps: JourneyStep[] = [
    {
      key: 'poptavka',
      label: LABELS.poptavka,
      done: maPoptavku,
      waiting: maPoptavku ? undefined : 'Zakázku jste zapsal ručně.',
    },
    {
      key: 'hovor',
      label: LABELS.hovor,
      done: facts.schuzka,
      action: { label: 'Domluvit termín', href: '/dashboard/calendar' },
    },
    {
      key: 'nabidka',
      label: LABELS.nabidka,
      done: maCenu,
      action: { label: 'Doplnit cenu', href: '#editace-zakazky' },
    },
    {
      key: 'zaloha',
      label: LABELS.zaloha,
      // Zakázka bez zálohy tenhle krok přeskakuje — není co splnit.
      done: chceZalohu ? project.deposit_paid : true,
      action: { label: 'Doplnit zálohu', href: '#editace-zakazky' },
    },
    {
      key: 'prace',
      label: LABELS.prace,
      done: stage >= AFTER.in_progress,
      action: { label: 'Začít pracovat', status: 'in_progress' },
    },
    {
      key: 'predano',
      label: LABELS.predano,
      done: stage >= AFTER.review,
      action: { label: 'Předat klientovi', status: 'review' },
    },
    {
      key: 'faktura',
      label: LABELS.faktura,
      done: facts.faktura,
      action: { label: 'Otevřít fakturaci', href: '?zalozka=fakturace' },
    },
    {
      key: 'zaplaceno',
      label: LABELS.zaplaceno,
      done: facts.fakturaZaplacena || project.paid,
      action: { label: 'Otevřít fakturaci', href: '?zalozka=fakturace' },
    },
    {
      key: 'hodnoceni',
      label: LABELS.hodnoceni,
      done: facts.hodnoceni,
      waiting: project.closed_at
        ? 'Dotazník klientovi odešel, čeká se na odpověď.'
        : 'Dotazník odejde sám, až zakázku uzavřete.',
    },
  ]

  return steps
}

/** První nesplněný krok — ten, na který se pod osou nabídne tlačítko. */
export function nextStep(steps: JourneyStep[]): JourneyStep | null {
  return steps.find((s) => !s.done) ?? null
}
