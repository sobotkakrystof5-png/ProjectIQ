/**
 * AI asistent jako CRM (R-120) — čisté funkce bez databáze: popisky stavů,
 * filtry kontaktů, časová osa klienta. Zvlášť od `outreach-crm.ts`, protože
 * je potřebují i testy a klientské komponenty, a ten modul je `server-only`.
 *
 * Texty od modelu (shrnutí, přepis) a náš text e-mailu se vykreslují jen
 * jako text — React escapuje sám.
 */

import type { AnalysisCall } from '@/lib/admin/outreach-analysis'
import type { OutreachQueueRow } from '@/lib/admin/outreach-view'

// ─── Stavy z Growth OS ───────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  new: 'Čeká na první hovor',
  scheduled: 'Hovor naplánovaný',
  called: 'Obvolaný',
  no_answer: 'Nezvedl',
  voicemail: 'Záznamník',
  declined: 'Odmítl',
  callback_later: 'Zavolat jindy',
  do_not_call: 'Nevolat',
  accepted: 'Chce ukázku',
  meeting_booked: 'Domluvená schůzka',
  demo_building: 'Ukázka se staví',
  demo_ready: 'Ukázka hotová',
  email_sent: 'Ukázka odeslaná',
  email_opened: 'Otevřel e-mail',
  demo_viewed: 'Prohlédl ukázku',
  replied: 'Odpověděl',
  meeting_held: 'Schůzka proběhla',
  won: 'Zakázka',
  lost: 'Nevyšlo',
}

/** Česky pro člověka; neznámý stav z novější verze Growth OS se ukáže, jak přišel. */
export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status
}

/** Stavy, kdy už klient řekl ano ukázce (a dál). */
export const ACCEPTED_STATUSES = [
  'accepted',
  'meeting_booked',
  'demo_building',
  'demo_ready',
  'email_sent',
  'email_opened',
  'demo_viewed',
  'replied',
  'meeting_held',
  'won',
] as const

// ─── Filtry kontaktů ─────────────────────────────────────────────────────────

export const CONTACT_FILTERS = [
  { key: 'na-tahu', label: 'Na tahu' },
  { key: 'ukazka', label: 'Ukázka odeslaná' },
  { key: 'otevreli', label: 'Otevřeli' },
  { key: 'zajem', label: 'Odpověď a schůzka' },
  { key: 'vyrizene', label: 'Vyřízené' },
  { key: 'vse', label: 'Všichni' },
] as const

export type ContactFilter = (typeof CONTACT_FILTERS)[number]['key']

export function parseContactFilter(raw: string | undefined): ContactFilter {
  return (CONTACT_FILTERS.find((f) => f.key === raw)?.key ?? 'na-tahu') as ContactFilter
}

/** Hledaný text do ILIKE: bez zástupných znaků, nejvýš 80 znaků. */
export function searchPattern(raw: string | undefined): { like: string; digits: string | null } | null {
  const q = (raw ?? '').trim().slice(0, 80)
  if (!q) return null
  const escaped = q.replace(/[\\%_]/g, (c) => `\\${c}`)
  const digits = q.replace(/\D/g, '')
  return { like: `%${escaped}%`, digits: digits.length >= 3 ? digits : null }
}

// ─── Klient ──────────────────────────────────────────────────────────────────

export type ContactRow = {
  id: string
  externalId: string
  company: string
  contactName: string | null
  industry: string | null
  city: string | null
  status: string
  attempts: number
  lastCallAt: string | null
  demoUrl: string | null
  demoViews: number
  demoEmailSentAt: string | null
  emailOpenedAt: string | null
  emailRepliedAt: string | null
  meetingAt: string | null
  callbackAt: string | null
  handledReason: string | null
  updatedAt: string
}

export type ContactDetail = ContactRow & {
  phone: string | null
  email: string | null
  /** Kontakt v Kontaktech (R-141): telefon a e-mail výš jsou pak z něj. */
  contactId: string | null
  website: string | null
  segment: string | null
  sourceBatch: string | null
  doNotCall: boolean
  callSummary: string | null
  callbackText: string | null
  nextCallAfter: string | null
  demoStatus: string | null
  demoSlug: string | null
  demoPreviewUrl: string | null
  demoBuiltAt: string | null
  demoFirstViewedAt: string | null
  demoLastViewedAt: string | null
  demoMaxViewS: number | null
  coldEmailSentAt: string | null
  emailClickedAt: string | null
  statusHistory: { at: string; status: string }[]
  research: { angle: string | null; hook: string | null; findings: string[] } | null
  snapshotVersion: number
  handledAt: string | null
  clientLeadId: string | null
  receivedAt: string
}

export type CallView = AnalysisCall & {
  /** uuid řádku v `outreach_calls` (kotva v detailu klienta). */
  rowId: string
  conversationId: string | null
  costCzk: number | null
  costSource: string | null
  telephonyStatus: string | null
  collected: Record<string, string>
  criteria: { id: string; name: string; result: string; rationale?: string | null }[]
}

export type EmailView = {
  id: string
  kind: string
  status: string | null
  subject: string | null
  bodyText: string | null
  scheduledFor: string | null
  sentAt: string | null
  deliveredAt: string | null
  openedAt: string | null
  clickedAt: string | null
  repliedAt: string | null
  bouncedAt: string | null
  openCount: number
  clickCount: number
}

export function emailKindLabel(kind: string): string {
  switch (kind) {
    case 'cold':
      return 'Úvodní e-mail'
    case 'demo':
      return 'E-mail s ukázkou'
    case 'reminder':
      return 'Připomínka'
    case 'followup':
      return 'Navazující e-mail'
    default:
      return 'E-mail'
  }
}

const COLLECTED_LABELS: Record<string, string> = {
  chce_ukazku: 'Chce ukázku',
  vybrany_termin: 'Vybraný termín',
  termin_text: 'Termín jeho slovy',
  email_jiny: 'Jiný e-mail',
  nevolat: 'Nevolat',
  spravna_osoba: 'Správná osoba',
  zavolat_jindy: 'Zavolat jindy',
  namitky: 'Námitky',
  poznamka_k_webu: 'Poznámka k webu',
}

export function collectedLabel(key: string): string {
  return COLLECTED_LABELS[key] ?? key.replace(/_/g, ' ')
}

/** „true"/„false" z ElevenLabs po česku; ostatní hodnoty beze změny. */
export function collectedValue(value: string): string {
  if (value === 'true') return 'ano'
  if (value === 'false') return 'ne'
  return value
}

export function criterionLabel(result: string): { label: string; ok: boolean | null } {
  if (result === 'success') return { label: 'Splnil', ok: true }
  if (result === 'failure') return { label: 'Nesplnil', ok: false }
  return { label: 'Nejde posoudit', ok: null }
}

// ─── Časová osa ──────────────────────────────────────────────────────────────

export type TimelineEvent = {
  at: string
  title: string
  detail?: string
  /** Čeká na vás / dobré znamení (signal), konec (danger), ostatní neutral. */
  tone: 'signal' | 'neutral' | 'danger' | 'strong'
  /** Je to v budoucnu (naplánovaný hovor, schůzka)? */
  future: boolean
  /** Kotva na kartu hovoru nebo e-mailu v detailu. */
  anchor?: string
}

/** Stavy z historie, které jiná událost (hovor, e-mail) nepopisuje. */
const HISTORY_ONLY: Record<string, { title: string; tone: TimelineEvent['tone'] }> = {
  meeting_held: { title: 'Schůzka proběhla', tone: 'strong' },
  won: { title: 'Zakázka', tone: 'strong' },
  lost: { title: 'Nevyšlo', tone: 'danger' },
  do_not_call: { title: 'Nechce, abychom volali', tone: 'danger' },
}

function callTitle(result: string): { title: string; tone: TimelineEvent['tone'] } {
  switch (result) {
    case 'SOUHLAS':
      return { title: 'Hovor: chce ukázku', tone: 'signal' }
    case 'zavolat jindy':
      return { title: 'Hovor: zavolat jindy', tone: 'signal' }
    case 'odmítl':
      return { title: 'Hovor: odmítl', tone: 'danger' }
    case 'NEVOLAT':
      return { title: 'Hovor: nechce, abychom volali', tone: 'danger' }
    case 'nezvedl':
      return { title: 'Hovor: nezvedl', tone: 'neutral' }
    case 'záznamník':
      return { title: 'Hovor: záznamník', tone: 'neutral' }
    case 'čeká':
      return { title: 'Hovor: čeká na výsledek', tone: 'neutral' }
    default:
      return { title: `Hovor: ${result}`, tone: 'neutral' }
  }
}

/**
 * Všechno, co se s klientem stalo, od nejnovějšího. Čistá funkce: skládá se
 * z hovorů, e-mailů, ukázky, historie stavů a toho, co udělal Kryštof.
 */
export function buildTimeline(
  lead: ContactDetail,
  calls: CallView[],
  emails: EmailView[],
  now: Date = new Date(),
): TimelineEvent[] {
  const out: TimelineEvent[] = []
  const push = (at: string | null, e: Omit<TimelineEvent, 'at' | 'future'>) => {
    if (!at || Number.isNaN(Date.parse(at))) return
    out.push({ ...e, at, future: Date.parse(at) > now.getTime() })
  }

  for (const c of calls) {
    const { title, tone } = callTitle(c.result)
    push(c.calledAt ?? `${c.date}T12:00:00Z`, {
      title,
      tone,
      detail: durationLabel(c.durationS) ?? undefined,
      anchor: `hovor-${c.rowId}`,
    })
  }

  for (const e of emails) {
    const label = emailKindLabel(e.kind)
    const anchor = `email-${e.id}`
    if (e.sentAt) push(e.sentAt, { title: `Odešel ${label.toLowerCase()}`, tone: 'neutral', detail: e.subject ?? undefined, anchor })
    else if (e.scheduledFor) push(e.scheduledFor, { title: `Naplánovaný ${label.toLowerCase()}`, tone: 'neutral', anchor })
    push(e.bouncedAt, { title: `${label} se nedoručil`, tone: 'danger', anchor })
    push(e.openedAt, { title: `Otevřel ${label.toLowerCase()}`, tone: 'signal', anchor })
    push(e.clickedAt, { title: `Klikl v e-mailu`, tone: 'signal', anchor })
    push(e.repliedAt, { title: 'Odpověděl na e-mail', tone: 'signal', anchor })
  }

  // Bez seznamu e-mailů (kontrakt v1) aspoň souhrnné časy ze snímku.
  if (emails.length === 0) {
    push(lead.coldEmailSentAt, { title: 'Odešel úvodní e-mail', tone: 'neutral' })
    push(lead.demoEmailSentAt, { title: 'Odešel e-mail s ukázkou', tone: 'neutral' })
    push(lead.emailOpenedAt, { title: 'Otevřel e-mail', tone: 'signal' })
    push(lead.emailClickedAt, { title: 'Klikl v e-mailu', tone: 'signal' })
    push(lead.emailRepliedAt, { title: 'Odpověděl na e-mail', tone: 'signal' })
  }

  push(lead.demoBuiltAt, { title: 'Ukázka hotová', tone: 'neutral', anchor: 'ukazka' })
  push(lead.demoFirstViewedAt, { title: 'Poprvé otevřel ukázku', tone: 'signal', anchor: 'ukazka' })
  if (lead.demoLastViewedAt && lead.demoLastViewedAt !== lead.demoFirstViewedAt) {
    push(lead.demoLastViewedAt, {
      title: 'Naposledy otevřel ukázku',
      tone: 'signal',
      detail: lead.demoViews > 1 ? `celkem ${lead.demoViews}×` : undefined,
      anchor: 'ukazka',
    })
  }

  push(lead.meetingAt, { title: 'Schůzka domluvená s asistentem', tone: 'strong' })
  if (lead.nextCallAfter && !lead.handledAt && !lead.doNotCall) {
    push(lead.nextCallAfter, { title: 'Asistent zavolá znovu', tone: 'neutral' })
  }

  for (const h of lead.statusHistory) {
    const known = HISTORY_ONLY[h.status]
    if (known) push(h.at, known)
  }

  if (lead.handledAt) {
    push(lead.handledAt, {
      title: lead.handledReason === 'prevzato' ? 'Převzal jste ho do Hovorů' : 'Odložil jste ho: nemá zájem',
      tone: lead.handledReason === 'prevzato' ? 'strong' : 'neutral',
    })
  }

  out.sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
  return out
}

// ─── Drobnosti pro obrazovky ─────────────────────────────────────────────────

/** Detail jako řádek fronty — pro tlačítka a dialog schůzky. */
export function toQueueRow(d: ContactDetail): OutreachQueueRow {
  return {
    id: d.id,
    company: d.company,
    contactName: d.contactName,
    phone: d.phone,
    email: d.email,
    website: d.website,
    industry: d.industry,
    city: d.city,
    status: d.status,
    attempts: d.attempts,
    lastCallAt: d.lastCallAt,
    callSummary: d.callSummary,
    callbackAt: d.callbackAt,
    callbackText: d.callbackText,
    demoUrl: d.demoUrl,
    demoStatus: d.demoStatus,
    demoViews: d.demoViews,
    demoFirstViewedAt: d.demoFirstViewedAt,
    demoEmailSentAt: d.demoEmailSentAt,
    emailOpenedAt: d.emailOpenedAt,
    emailClickedAt: d.emailClickedAt,
    emailRepliedAt: d.emailRepliedAt,
    receivedAt: d.receivedAt,
    contactId: d.contactId,
    clientLeadId: d.clientLeadId,
  }
}

/** „před chvílí", „před 12 min", „před 3 h", „před 2 dny". */
export function agoLabel(isoAt: string, now: Date = new Date()): string {
  const s = Math.max(0, Math.round((now.getTime() - Date.parse(isoAt)) / 1000))
  if (s < 90) return 'před chvílí'
  const min = Math.round(s / 60)
  if (min < 60) return `před ${min} min`
  const h = Math.round(min / 60)
  if (h < 36) return `před ${h} h`
  const d = Math.round(h / 24)
  return d === 1 ? 'před 1 dnem' : `před ${d} dny`
}

/** Délka „1 min 25 s" / „48 s". */
export function durationLabel(seconds: number | null): string | null {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) return null
  const s = Math.round(seconds)
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  const rest = s % 60
  return rest ? `${m} min ${rest} s` : `${m} min`
}

const CZK = new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK', maximumFractionDigits: 2 })

export function czk(value: number | null): string | null {
  return value === null || !Number.isFinite(value) ? null : CZK.format(value)
}

/** Data z Growth OS jsou stará: v pracovní den po 9:00 víc než 3 h bez snímku. */
export function syncIsStale(lastIso: string | null, now: Date = new Date()): boolean {
  if (!lastIso) return true
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Prague', weekday: 'short', hour: 'numeric', hourCycle: 'h23' })
    .formatToParts(now)
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? ''
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0)
  const workingHours = !['Sat', 'Sun'].includes(weekday) && hour >= 9 && hour < 20
  const age = now.getTime() - Date.parse(lastIso)
  return workingHours ? age > 3 * 3_600_000 : age > 72 * 3_600_000
}
