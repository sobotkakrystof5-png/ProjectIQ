// Pravidla klientského portálu (S16, R-051): do kdy může zákazník termín
// přesunout nebo zrušit a adresa provozovny. Žijí v ws.businesses.settings
// (bez migrace), čte je portál, e-maily i Nastavení. Bez importů serveru.

/** Kolik hodin před termínem jde ještě přesouvat a rušit. null = zákazník nemůže (jen se ozve). */
export const CHANGE_HOURS_OPTIONS = [0, 2, 12, 24, 48] as const
export type ChangeHours = (typeof CHANGE_HOURS_OPTIONS)[number] | null

export const DEFAULT_CHANGE_HOURS: ChangeHours = 24
export const ADDRESS_MAX = 200

export type PortalRules = { changeHours: ChangeHours; address: string | null }

export function portalRules(settings: unknown): PortalRules {
  const s = settings && typeof settings === 'object' ? (settings as Record<string, unknown>) : {}
  const raw = s.portal_change_hours
  const changeHours: ChangeHours =
    raw === null ? null : (CHANGE_HOURS_OPTIONS as readonly unknown[]).includes(raw) ? (raw as ChangeHours) : DEFAULT_CHANGE_HOURS
  const address = typeof s.address === 'string' && s.address.trim() ? s.address.trim().slice(0, ADDRESS_MAX) : null
  return { changeHours, address }
}

export function changeHoursLabel(h: ChangeHours): string {
  if (h === null) return 'Nemůže, jen se vám ozve'
  if (h === 0) return 'Kdykoli před začátkem'
  return `Nejpozději ${h} hodin předem`
}

/** Do kdy jde termín měnit. null = nejde vůbec. */
export function changeDeadline(start: Date, h: ChangeHours): Date | null {
  return h === null ? null : new Date(start.getTime() - h * 3_600_000)
}
