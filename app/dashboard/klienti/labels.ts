import type { BillingAccess } from '@/lib/ws/billing'

// Popisky stavů pro /dashboard/klienti. Barvu stavu nese BILLING_ACCESS_TONE
// v lib/admin-status.ts (AD05) — obrazovka si vlastní paletu nedělá.

export const ACCESS_LABEL: Record<BillingAccess, string> = {
  none: 'Bez předplatného',
  trialing: 'Zkušební doba',
  active: 'Platí',
  grace: 'Nezaplaceno (lhůta)',
  read_only: 'Jen čtení',
}

export const AUDIT_LABEL: Record<string, string> = {
  'admin.account_created': 'Admin založil účet a byznys',
  'admin.invite_sent': 'Admin poslal pozvánku',
  'admin.web_keys_generated': 'Admin vytvořil klíče pro web',
  'admin.note_saved': 'Admin upravil poznámku',
  'admin.note_deleted': 'Admin smazal poznámku',
}

export function formatDate(d: Date | null): string {
  if (!d) return '—'
  return d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'Europe/Prague' })
}

export function formatDateTime(d: Date): string {
  return d.toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Prague' })
}

/** „před 3 dny“ — hrubě, pro přehled. */
export function ago(d: Date | null, now = new Date()): string {
  if (!d) return 'nikdy'
  const days = Math.floor((now.getTime() - d.getTime()) / 86_400_000)
  if (days <= 0) return 'dnes'
  if (days === 1) return 'včera'
  if (days < 31) return `před ${days} dny`
  return formatDate(d)
}

/** 1 byznys, 2 byznysy, 5 byznysů. */
export function plural(n: number, one: string, few: string, many: string): string {
  return `${n} ${n === 1 ? one : n >= 2 && n <= 4 ? few : many}`
}
