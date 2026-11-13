// Úvodní stránka administrace „Dnes“ (KP02): co je teď potřeba udělat.
// Čisté funkce bez DB — dotazy jsou v lib/admin-today-queries.ts.

import type { ForeignTotal } from '@/lib/money-currency'

export interface TodayRequest {
  id: string
  clientName: string
  summary: string | null
  createdAt: string
  href: string
}

export interface TodayDraftGroup {
  projectId: string
  clientName: string
  count: number
  sensitive: number
  href: string
}

export interface TodayInvoice {
  id: string
  number: string
  clientName: string | null
  dueOn: string
  amount: number
  currency: string
}

export interface TodayEvent {
  id: string
  at: string
  label: string
  detail: string | null
  href: string
}

export interface TodayStaleProject {
  id: string
  clientName: string
  updatedAt: string
  href: string
}

/** Nezaplacené faktury v jedné měně. Měny se nikdy nesčítají (R-011). */
export interface UnpaidInvoiceLine {
  currency: string
  amount: number
  count: number
  /** Kolik z nich je po splatnosti. */
  overdue: number
}

/**
 * „Jak se daří tenhle měsíc" na Dnes (AD03). Příjem je za kalendářní měsíc,
 * daň a rezerva za celý rok — daň se počítá z ročního příjmu, měsíční díl by
 * byl vymyšlené číslo.
 */
export interface MonthMoney {
  /** Měsíc v Praze, `YYYY-MM`. */
  month: string
  year: number
  /** Příjem za tenhle měsíc, obě linie dohromady. */
  income: number
  /** Z toho fakturovaný na IČO, tedy ten, co jde do přiznání. */
  declaredIncome: number
  /** Přiznaný příjem za celý rok — vstup do odhadu daně. Jen koruny. */
  yearDeclaredIncome: number
  /**
   * Příjem měsíce v cizí měně. Stojí vedle korun, nikdy v nich — bez kurzu
   * by součet přes měny byl vymyšlené číslo (R-048, migrace 109).
   */
  foreignIncome: ForeignTotal[]
  unpaidInvoices: UnpaidInvoiceLine[]
  /** Odhad daně a odvodů z ročního přiznaného příjmu (`calculateTax`). */
  levies: number
  /** Kolik si na ně měsíčně odkládat. */
  monthlyReserve: number
  /** Rok, pro který platí sazby v `lib/tax-constants.ts`. */
  ratesYear: number
  /** Sedí sazby na zobrazený rok? */
  ratesMatchYear: boolean
}

export interface TodayData {
  requests: TodayRequest[]
  drafts: TodayDraftGroup[]
  overdueInvoices: TodayInvoice[]
  upcoming: TodayEvent[]
  stale: TodayStaleProject[]
}

export const EMPTY_TODAY: TodayData = { requests: [], drafts: [], overdueInvoices: [], upcoming: [], stale: [] }

export type FocusKind = 'request' | 'draft' | 'invoice' | 'event' | 'stale'

export interface TodayFocus {
  kind: FocusKind
  title: string
  detail: string
  href: string
  cta: string
}

/** Dny bez pohybu, po kterých zakázka přijde na seznam „bez pohybu“. */
export const STALE_AFTER_DAYS = 14
/** Událost se bere jako hlavní věc, když je do 24 hodin. */
export const EVENT_FOCUS_HOURS = 24

const plural = (n: number, one: string, few: string, many: string): string =>
  n === 1 ? one : n >= 2 && n <= 4 ? few : many

export const daysBetween = (from: Date | string, to: Date): number =>
  Math.floor((to.getTime() - new Date(from).getTime()) / 86_400_000)

/**
 * Jedna hlavní věc nahoře. Pořadí: požadavek klienta (čeká klient) → hlášení
 * ke schválení → faktura po splatnosti → blízká schůzka → zakázka bez pohybu.
 * Nic z toho = null (prázdný stav).
 */
export function pickFocus(data: TodayData, now: Date = new Date()): TodayFocus | null {
  const request = data.requests[0]
  if (request) {
    const more = data.requests.length - 1
    return {
      kind: 'request',
      title: `Klient ${request.clientName} vám psal`,
      detail: request.summary?.trim() || (more > 0 ? `A ještě ${more} další.` : 'Podívejte se, co chce změnit.'),
      href: request.href,
      cta: 'Otevřít požadavek',
    }
  }

  const draft = data.drafts[0]
  if (draft) {
    const total = data.drafts.reduce((sum, d) => sum + d.count, 0)
    return {
      kind: 'draft',
      title: `${total} ${plural(total, 'hlášení čeká', 'hlášení čekají', 'hlášení čeká')} na schválení`,
      detail: `Nejdřív ${draft.clientName}. Klient je uvidí až po schválení.`,
      href: draft.href,
      cta: 'Schválit hlášení',
    }
  }

  const invoice = data.overdueInvoices[0]
  if (invoice) {
    const late = Math.max(daysBetween(invoice.dueOn, now), 1)
    return {
      kind: 'invoice',
      title: `Faktura ${invoice.number} je ${late} ${plural(late, 'den', 'dny', 'dní')} po splatnosti`,
      detail: invoice.clientName ?? 'Bez jména odběratele.',
      href: '/dashboard/faktury',
      cta: 'Otevřít faktury',
    }
  }

  const event = data.upcoming.find((e) => {
    const diff = new Date(e.at).getTime() - now.getTime()
    return diff >= 0 && diff <= EVENT_FOCUS_HOURS * 3_600_000
  })
  if (event) {
    return {
      kind: 'event',
      title: event.label,
      detail: event.detail ?? 'Blíží se schůzka.',
      href: event.href,
      cta: 'Otevřít',
    }
  }

  const stale = data.stale[0]
  if (stale) {
    const days = daysBetween(stale.updatedAt, now)
    return {
      kind: 'stale',
      title: `${stale.clientName} se ${days} ${plural(days, 'den', 'dny', 'dní')} nehýbe`,
      detail: 'Zakázka nemá žádnou změnu. Dejte klientovi vědět, nebo ji posuňte.',
      href: stale.href,
      cta: 'Otevřít zakázku',
    }
  }

  return null
}

/** Je na Dnes vůbec co ukázat? */
export const isTodayEmpty = (data: TodayData): boolean =>
  data.requests.length + data.drafts.length + data.overdueInvoices.length + data.upcoming.length + data.stale.length === 0
