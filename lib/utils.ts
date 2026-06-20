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

export function formatDate(date: string | Date | null): string {
  if (!date) return '—'
  return new Intl.DateTimeFormat('cs-CZ', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date instanceof Date ? date : new Date(date))
}

function appBaseUrl(): string {
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
