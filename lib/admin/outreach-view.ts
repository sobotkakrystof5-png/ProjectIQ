/**
 * Fronta „Komu zavolat" (R-112) — čisté funkce bez databáze.
 *
 * Zvlášť od `lib/admin/outreach.ts`, protože je potřebuje i klientská
 * komponenta (popisky a řazení), a ten modul je `server-only`.
 */

/** Stavy, kdy je na tahu člověk. Ostatní (nové, nedovoláno…) řeší robot. */
export const QUEUE_STATUSES = [
  'accepted',
  'callback_later',
  'meeting_booked',
  'demo_building',
  'demo_ready',
  'email_sent',
  'email_opened',
  'demo_viewed',
  'replied',
  'meeting_held',
] as const

/** Konec: z fronty pryč, i kdyby se ukázka ještě otevřela. */
export const CLOSED_STATUSES = ['declined', 'do_not_call', 'won', 'lost'] as const

export type OutreachQueueRow = {
  id: string
  company: string
  contactName: string | null
  phone: string | null
  email: string | null
  website: string | null
  industry: string | null
  city: string | null
  status: string
  attempts: number
  lastCallAt: string | null
  callSummary: string | null
  callbackAt: string | null
  callbackText: string | null
  demoUrl: string | null
  demoStatus: string | null
  demoViews: number
  demoFirstViewedAt: string | null
  demoEmailSentAt: string | null
  emailOpenedAt: string | null
  emailClickedAt: string | null
  emailRepliedAt: string | null
  receivedAt: string
}

export type QueueReason = {
  /** Menší = výš ve frontě. */
  rank: number
  label: string
  /** Čeká na vás (signal), nebo běží samo (neutral). */
  urgent: boolean
}

const PRAGUE = 'Europe/Prague'

function pragueDay(instant: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: PRAGUE }).format(instant)
}

/** „dnes 14:30", „zítra 9:00", „čt 20. 11. 15:00" — pražský čas. */
export function formatWhen(iso: string, now: Date = new Date()): string {
  const at = new Date(iso)
  const time = new Intl.DateTimeFormat('cs-CZ', { timeZone: PRAGUE, hour: 'numeric', minute: '2-digit' }).format(at)
  const day = pragueDay(at)
  const today = pragueDay(now)
  const tomorrow = pragueDay(new Date(now.getTime() + 86_400_000))
  if (day === today) return `dnes ${time}`
  if (day === tomorrow) return `zítra ${time}`
  const date = new Intl.DateTimeFormat('cs-CZ', {
    timeZone: PRAGUE,
    weekday: 'short',
    day: 'numeric',
    month: 'numeric',
  }).format(at)
  return `${date} ${time}`
}

/**
 * Proč je firma ve frontě a jak vysoko. Čistá funkce: řazení i popisek se
 * dají otestovat bez databáze.
 */
export function queueReason(row: OutreachQueueRow, now: Date = new Date()): QueueReason {
  const views = row.demoViews

  if (row.emailRepliedAt) return { rank: 0, label: 'Odpověděl na e-mail', urgent: true }

  if (row.callbackAt) {
    const at = new Date(row.callbackAt)
    const dueToday = pragueDay(at) <= pragueDay(now)
    const label =
      row.status === 'meeting_booked'
        ? `Domluvený hovor ${formatWhen(row.callbackAt, now)}`
        : at.getTime() < now.getTime()
          ? `Chtěl zavolat ${formatWhen(row.callbackAt, now)}`
          : `Chce zavolat ${formatWhen(row.callbackAt, now)}`
    return { rank: dueToday ? 1 : 4, label, urgent: dueToday }
  }

  if (views > 0) {
    return {
      rank: 2,
      label: views === 1 ? 'Otevřel ukázku' : `Otevřel ukázku ${views}×`,
      urgent: true,
    }
  }

  if (row.status === 'callback_later') return { rank: 3, label: 'Chce, abyste zavolal', urgent: true }
  if (row.emailClickedAt || row.emailOpenedAt) return { rank: 3, label: 'Otevřel e-mail s ukázkou', urgent: true }
  if (row.demoEmailSentAt) return { rank: 5, label: 'Ukázka odeslaná, zatím neotevřená', urgent: false }
  if (row.status === 'accepted' || row.status === 'demo_building' || row.status === 'demo_ready') {
    return { rank: 6, label: 'Chce ukázku, připravuje se', urgent: false }
  }
  return { rank: 7, label: 'Čeká na vás', urgent: false }
}

/** Pořadí ve frontě: důvod, pak čas zavolání, pak nejnovější. */
export function sortQueue(rows: OutreachQueueRow[], now: Date = new Date()): OutreachQueueRow[] {
  const keyed = rows.map((row) => ({ row, reason: queueReason(row, now) }))
  keyed.sort((a, b) => {
    if (a.reason.rank !== b.reason.rank) return a.reason.rank - b.reason.rank
    const ac = a.row.callbackAt ? Date.parse(a.row.callbackAt) : Number.POSITIVE_INFINITY
    const bc = b.row.callbackAt ? Date.parse(b.row.callbackAt) : Number.POSITIVE_INFINITY
    if (ac !== bc) return ac - bc
    return Date.parse(b.row.receivedAt) - Date.parse(a.row.receivedAt)
  })
  return keyed.map((k) => k.row)
}

