import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number | null): string {
  if (amount === null) return '—'
  return new Intl.NumberFormat('cs-CZ', {
    style: 'currency',
    currency: 'CZK',
    maximumFractionDigits: 0,
  }).format(amount)
}

// Datum a čas v adminu vždy v pražské zóně, ne v zóně serveru: Vercel běží
// v UTC a bez `timeZone` ukazoval čas o 1–2 h vedle a kolem půlnoci i jiný
// den (audit 2026-11-24, #13). Samotné datum `YYYY-MM-DD` je půlnoc UTC, tedy
// v Praze pořád týž den.
export function formatDate(date: string | Date | null): string {
  if (!date) return '—'
  return new Intl.DateTimeFormat('cs-CZ', {
    timeZone: 'Europe/Prague',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date instanceof Date ? date : new Date(date))
}

export function formatDateTime(date: string | Date | null): string {
  if (!date) return '—'
  return new Intl.DateTimeFormat('cs-CZ', {
    timeZone: 'Europe/Prague',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date instanceof Date ? date : new Date(date))
}

export function appBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    (typeof window !== 'undefined' ? window.location.origin : '')
  )
}

export function getPublicUrl(token: string): string {
  return `${appBaseUrl()}/p/${token}`
}

export function getSurveyUrl(token: string): string {
  return `${appBaseUrl()}/h/${token}`
}

// Odkazy na zavolání a napsání (`tel:`, `sms:`, `mailto:`, `wa.me`) jsou od
// AD10 v `lib/contacts/href.ts` — jedno místo, které umí i text zprávy
// a hlídá, co se dostane do adresy.
