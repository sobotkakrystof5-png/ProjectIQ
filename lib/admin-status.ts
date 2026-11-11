import type { BadgeProps } from '@/components/ui/badge'
import type { BillingAccess } from '@/lib/ws/billing'
import type {
  ChangeType,
  ImprovementStatus,
  LeadActionType,
  LeadStatus,
  ProjectStatus,
  StartupPhase,
} from '@/lib/types'

/**
 * Jeden barevný systém stavů pro celý admin (AD05).
 *
 * Dřív měla skoro každá obrazovka vlastní tabulku tříd — `STATUS_STYLES`,
 * `LEAD_STATUS_STYLES`, `ACTION_TYPE_STYLES`, `ACCESS_CLASS`, `STARTUP_PHASES.color`
 * a další. Dohromady 40 kombinací v 17 odstínech, takže stejná barva znamenala
 * na dvou obrazovkách něco jiného. Dílky mají jednu paletu, proto pět tónů:
 *
 * | tón | kdy | jak vypadá |
 * |---|---|---|
 * | `neutral` | nic se neděje, kategorie (typ hovoru, druh změny) | nejsvětlejší |
 * | `info` | běží, je rozdělané | navy-100 |
 * | `signal` | **čeká na vás** — nová poptávka, velký zájem | jediná teplá barva |
 * | `success` | uzavřeno, zaplaceno, platí | tmavá navy |
 * | `danger` | ztraceno, zrušeno, nezaplaceno | červená |
 *
 * Pravidlo: tón nese *naléhavost*, ne druh. Kategorie (typ akce, druh změny)
 * jsou vždy `neutral` a rozlišuje je popisek a ikona — barvy by z nich udělaly
 * stavy, kterými nejsou.
 */
export type AdminTone = 'neutral' | 'info' | 'signal' | 'success' | 'danger'

/** Tón → varianta `components/ui/badge.tsx`. Jediné místo, kde se barva vybírá. */
const VARIANT: Record<AdminTone, NonNullable<BadgeProps['variant']>> = {
  neutral: 'neutral',
  info: 'confirmed',
  signal: 'signal',
  success: 'strong',
  danger: 'danger',
}

export function toneVariant(tone: AdminTone): NonNullable<BadgeProps['variant']> {
  return VARIANT[tone]
}

/** Zakázka: nová a čekající na schválení volají po akci, zaplaceno je konec. */
export const PROJECT_STATUS_TONE: Record<ProjectStatus, AdminTone> = {
  new: 'signal',
  in_progress: 'info',
  review: 'signal',
  done: 'info',
  paid: 'success',
}

/** Hovor: velký zájem je jediné, co hoří. */
export const LEAD_STATUS_TONE: Record<LeadStatus, AdminTone> = {
  cold: 'neutral',
  warm: 'info',
  hot: 'signal',
  waiting: 'info',
  converted: 'success',
  lost: 'danger',
}

/** Typ akce je kategorie, ne stav — rozlišuje ho ikona a popisek. */
export const LEAD_ACTION_TONE: Record<LeadActionType, AdminTone> = {
  call: 'neutral',
  meeting: 'neutral',
  email: 'neutral',
  whatsapp: 'neutral',
  online: 'neutral',
  other: 'neutral',
}

/** Druh změny v changelogu je taky kategorie. */
export const CHANGE_TYPE_TONE: Record<ChangeType, AdminTone> = {
  development: 'neutral',
  fix: 'neutral',
  content: 'neutral',
  marketing: 'neutral',
  pricing: 'neutral',
  strategy: 'neutral',
  other: 'neutral',
}

export const IMPROVEMENT_STATUS_TONE: Record<ImprovementStatus, AdminTone> = {
  idea: 'neutral',
  in_progress: 'info',
  done: 'success',
}

/** Fáze osobního nebo startup projektu. */
export const STARTUP_PHASE_TONE: Record<StartupPhase, AdminTone> = {
  idea: 'neutral',
  research: 'neutral',
  mvp: 'info',
  launch: 'signal',
  growth: 'info',
  monetization: 'info',
  pivot: 'signal',
  active: 'success',
  paused: 'neutral',
  cancelled: 'danger',
}

/** Stav faktury: zaplaceno je konec, po splatnosti hoří, pohledávka čeká. */
export const INVOICE_STATE_TONE = {
  paid: 'success',
  overdue: 'danger',
  open: 'signal',
} as const satisfies Record<'paid' | 'overdue' | 'open', AdminTone>

export function invoiceTone(paid: boolean, overdue: boolean): AdminTone {
  return paid ? INVOICE_STATE_TONE.paid : overdue ? INVOICE_STATE_TONE.overdue : INVOICE_STATE_TONE.open
}

/** Předplatné klienta Workspace (S17). */
export const BILLING_ACCESS_TONE: Record<BillingAccess, AdminTone> = {
  none: 'neutral',
  trialing: 'info',
  active: 'success',
  grace: 'signal',
  read_only: 'danger',
}
