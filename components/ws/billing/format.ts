import { WS_TIME_ZONE } from '@/lib/ws/time'

const dateFormat = new Intl.DateTimeFormat('cs-CZ', {
  timeZone: WS_TIME_ZONE,
  day: 'numeric',
  month: 'numeric',
  year: 'numeric',
})

/** „23. 10. 2026" — pražské datum pro předplatné a doklady. */
export function formatBillingDate(value: Date | string): string {
  return dateFormat.format(value instanceof Date ? value : new Date(value))
}
