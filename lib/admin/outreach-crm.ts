import 'server-only'
import { adminDb, batchTolerant } from '@/lib/admin/db'
import { QUEUE_WHERE, loadOutreachQueue, type OutreachQueueRow } from '@/lib/admin/outreach'
import { outreachContactOverlay } from '@/lib/admin/contact-sync'
import { CLOSED_STATUSES } from '@/lib/admin/outreach-view'
import {
  ACCEPTED_STATUSES,
  searchPattern,
  type CallView,
  type ContactDetail,
  type ContactFilter,
  type ContactRow,
  type EmailView,
} from '@/lib/admin/outreach-crm-view'
import type { TranscriptTurn } from '@/types/outreach-report'
import { pgDate } from '@/lib/pg-date'
import { likeContains } from '@/lib/security/sql'

/**
 * AI asistent jako CRM (R-120): Přehled, Kontakty a detail klienta nad
 * daty z Growth OS (`outreach_leads`, `outreach_calls`, `outreach_emails`).
 *
 * Čte se přes `to_jsonb(řádek)`: chybějící sloupec (migrace 119 ještě neběžela)
 * je prostě klíč, který v JSON není — admin tak běží i na starší databázi,
 * jen bez údajů v2. Stejný postup jako dotazník (R-119).
 */

// ─── Převod hodnot ───────────────────────────────────────────────────────────

type Json = Record<string, unknown>

function str(v: unknown): string | null {
  return v === null || v === undefined || v === '' ? null : String(v)
}

function iso(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null
  const d = v instanceof Date ? v : new Date(String(v))
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function obj(v: unknown): Json {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Json
  if (typeof v === 'string') {
    try {
      const parsed = JSON.parse(v)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Json) : {}
    } catch {
      return {}
    }
  }
  return {}
}

function arr<T = unknown>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[]
  if (typeof v === 'string') {
    try {
      const parsed = JSON.parse(v)
      return Array.isArray(parsed) ? (parsed as T[]) : []
    } catch {
      return []
    }
  }
  return []
}

function day(v: unknown): string {
  return pgDate(v) ?? ''
}

function toContactRow(r: Json): ContactRow {
  return {
    id: String(r.id),
    externalId: String(r.external_id ?? ''),
    company: String(r.company_name ?? ''),
    contactName: str(r.contact_name),
    industry: str(r.industry),
    city: str(r.city),
    status: String(r.status ?? ''),
    attempts: Number(r.attempts ?? 0),
    lastCallAt: iso(r.last_call_at),
    demoUrl: str(r.demo_url),
    demoViews: Number(r.demo_views ?? 0),
    demoEmailSentAt: iso(r.demo_email_sent_at),
    emailOpenedAt: iso(r.email_opened_at),
    emailRepliedAt: iso(r.email_replied_at),
    meetingAt: iso(r.admin_meeting_at) ?? iso(r.meeting_at),
    callbackAt: iso(r.callback_at),
    handledReason: str(r.handled_reason),
    updatedAt: iso(r.source_updated_at) ?? iso(r.received_at) ?? new Date(0).toISOString(),
  }
}

function toContactDetail(r: Json): ContactDetail {
  const research = r.research ? obj(r.research) : null
  return {
    ...toContactRow(r),
    phone: str(r.phone),
    email: str(r.email),
    contactId: str(r.contact_id),
    website: str(r.website),
    segment: str(r.segment),
    sourceBatch: str(r.source_batch),
    doNotCall: r.do_not_call === true,
    callSummary: str(r.call_summary),
    callbackText: str(r.callback_text),
    nextCallAfter: iso(r.next_call_after),
    demoStatus: str(r.demo_status),
    demoSlug: str(r.demo_slug),
    demoPreviewUrl: str(r.demo_preview_url),
    demoBuiltAt: iso(r.demo_built_at),
    demoFirstViewedAt: iso(r.demo_first_viewed_at),
    demoLastViewedAt: iso(r.demo_last_viewed_at),
    demoMaxViewS: num(r.demo_max_view_s),
    coldEmailSentAt: iso(r.cold_email_sent_at),
    emailClickedAt: iso(r.email_clicked_at),
    statusHistory: arr<{ at?: unknown; status?: unknown }>(r.status_history)
      .map((h) => ({ at: iso(h.at), status: str(h.status) }))
      .filter((h): h is { at: string; status: string } => h.at !== null && h.status !== null),
    research: research
      ? {
          angle: str(research.angle),
          hook: str(research.hook),
          findings: arr<unknown>(research.findings).map(String).filter(Boolean),
        }
      : null,
    snapshotVersion: Number(r.snapshot_version ?? 1),
    handledAt: iso(r.handled_at),
    clientLeadId: str(r.client_lead_id),
    receivedAt: iso(r.received_at) ?? new Date(0).toISOString(),
  }
}

function toCallView(r: Json): CallView {
  return {
    rowId: String(r.id),
    id: String(r.external_id),
    leadId: String(r.lead_external_id),
    company: String(r.company_name ?? ''),
    date: day(r.report_date),
    round: num(r.round),
    calledAt: iso(r.called_at),
    result: String(r.result ?? ''),
    durationS: num(r.duration_s),
    whoHungUp: str(r.who_hung_up),
    hangupAtS: num(r.hangup_at_s),
    introS: num(r.intro_s),
    terminationReason: str(r.termination_reason),
    chanceLevel: str(r.chance_level),
    chanceWhy: arr<unknown>(r.chance_why).map(String),
    chanceAction: str(r.chance_action),
    summary: str(r.summary),
    objections: arr<unknown>(r.objections).map(String),
    failedCriteria: arr<{ id: string; name: string; rationale?: string | null }>(r.failed_criteria),
    segment: str(r.segment),
    industry: str(r.industry),
    openingVariant: str(r.opening_variant),
    transcript: r.transcript ? arr<TranscriptTurn>(r.transcript) : null,
    conversationId: str(r.conversation_id),
    costCzk: num(r.cost_czk),
    costSource: str(r.cost_source),
    telephonyStatus: str(r.telephony_status),
    collected: Object.fromEntries(
      Object.entries(obj(r.collected))
        .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '')
        .map(([k, v]) => [k, String(v)]),
    ),
    criteria: arr<{ id: string; name: string; result: string; rationale?: string | null }>(r.criteria),
  }
}

function toEmailView(r: Json): EmailView {
  return {
    id: String(r.id),
    kind: String(r.kind ?? ''),
    status: str(r.status),
    subject: str(r.subject),
    bodyText: str(r.body_text),
    scheduledFor: iso(r.scheduled_for),
    sentAt: iso(r.sent_at),
    deliveredAt: iso(r.delivered_at),
    openedAt: iso(r.opened_at),
    clickedAt: iso(r.clicked_at),
    repliedAt: iso(r.replied_at),
    bouncedAt: iso(r.bounced_at),
    openCount: Number(r.open_count ?? 0),
    clickCount: Number(r.click_count ?? 0),
  }
}

const isMissing = (err: unknown) => (err as { code?: string })?.code === '42P01'

// ─── Kontakty ────────────────────────────────────────────────────────────────

const ACCEPTED_SQL = `'{${ACCEPTED_STATUSES.join(',')}}'::text[]`
const J = `to_jsonb(l)`

/** SQL podmínka filtru. Sloupce z migrace 119 přes JSON, ať dotaz běží i bez ní. */
const FILTER_WHERE: Record<ContactFilter, string> = {
  'na-tahu': QUEUE_WHERE,
  ukazka: `(demo_url IS NOT NULL OR demo_email_sent_at IS NOT NULL)`,
  otevreli: `(demo_views > 0 OR email_opened_at IS NOT NULL OR email_clicked_at IS NOT NULL)`,
  zajem: `(email_replied_at IS NOT NULL OR (${J}->>'meeting_at') IS NOT NULL
           OR status IN ('replied', 'meeting_booked', 'meeting_held', 'won') OR handled_reason = 'prevzato')`,
  vyrizene: `(handled_at IS NOT NULL OR status = ANY ('{${CLOSED_STATUSES.join(',')}}'::text[]) OR do_not_call)`,
  vse: 'true',
}

export type ContactsScreen = {
  available: boolean
  rows: ContactRow[]
  counts: Record<ContactFilter, number>
  /** Fronta s akcemi (jen pro filtr „Na tahu"). */
  queue: OutreachQueueRow[] | null
}

const LIST_LIMIT = 200

export async function loadContacts(filter: ContactFilter, q: string | undefined, now: Date = new Date()): Promise<ContactsScreen> {
  const search = searchPattern(q)
  const params: unknown[] = []
  let searchSql = 'true'
  if (search) {
    params.push(search.like)
    const like = `$${params.length}`
    const parts = [`company_name ILIKE ${like}`, `contact_name ILIKE ${like}`, `email ILIKE ${like}`, `city ILIKE ${like}`]
    if (search.digits) {
      params.push(likeContains(search.digits))
      parts.push(`regexp_replace(coalesce(phone, ''), '\\D', '', 'g') LIKE $${params.length}`)
    }
    searchSql = `(${parts.join(' OR ')})`
  }

  const countSql = Object.entries(FILTER_WHERE)
    .map(([key, where]) => `count(*) FILTER (WHERE ${where})::int AS "${key}"`)
    .join(',\n          ')

  // Schůzka z kalendáře adminu (nejbližší budoucí, jinak poslední) má přednost
  // před tou, kterou poslal Growth OS. Bez migrace 115 (outreach_lead_id) se
  // dotaz zopakuje bez ní.
  const listQuery = (withMeeting: boolean) => ({
    text: `
      SELECT ${J} - 'call_summary' - 'status_history' - 'research'
             ${
               withMeeting
                 ? `|| jsonb_build_object('admin_meeting_at', (
                      SELECT e.starts_at FROM calendar_events e
                       WHERE e.outreach_lead_id = l.id
                       ORDER BY (e.starts_at >= now()) DESC, abs(extract(epoch FROM e.starts_at - now()))
                       LIMIT 1))`
                 : ''
             } AS row
        FROM outreach_leads l
       WHERE ${FILTER_WHERE[filter]} AND ${searchSql}
       ORDER BY source_updated_at DESC
       LIMIT ${LIST_LIMIT}`,
    params,
  })
  const countQuery = { text: `SELECT ${countSql} FROM outreach_leads l`, params: [] }

  try {
    let rows: Record<string, unknown>[]
    let counts: Record<string, unknown>[]
    try {
      ;[rows, counts] = await adminDb.batch([listQuery(true), countQuery])
    } catch (err) {
      if (!['42703', '42P01'].includes((err as { code?: string })?.code ?? '')) throw err
      ;[rows, counts] = await adminDb.batch([listQuery(false), countQuery])
    }
    const c = (counts[0] ?? {}) as Record<string, unknown>
    const queue = filter === 'na-tahu' && !search ? (await loadOutreachQueue(now)).rows : null
    return {
      available: true,
      rows: rows.map((r) => toContactRow(obj(r.row))),
      counts: Object.fromEntries(Object.keys(FILTER_WHERE).map((k) => [k, Number(c[k] ?? 0)])) as Record<ContactFilter, number>,
      queue,
    }
  } catch (err) {
    if (isMissing(err)) {
      return { available: false, rows: [], counts: {} as Record<ContactFilter, number>, queue: null }
    }
    throw err
  }
}

// ─── Detail klienta ──────────────────────────────────────────────────────────

export type ClientMeeting = { startsAt: string; meetUrl: string | null; inviteStatus: string | null }

export type ContactScreen = {
  lead: ContactDetail
  calls: CallView[]
  emails: EmailView[]
  meeting: ClientMeeting | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Detail klienta podle uuid řádku. `null` = neexistuje (nebo chybí migrace 114). */
export async function loadContact(id: string): Promise<ContactScreen | null> {
  if (!UUID.test(id)) return null
  let leadRow: Json | undefined
  try {
    const rows = await adminDb<{ row: unknown }>`SELECT to_jsonb(l) AS row FROM outreach_leads l WHERE id = ${id}::uuid`
    leadRow = rows[0] ? obj(rows[0].row) : undefined
  } catch (err) {
    if (isMissing(err)) return null
    throw err
  }
  if (!leadRow) return null
  const raw = toContactDetail(leadRow)
  // Telefon a e-mail z kontaktu mají přednost před snímkem z Growth OS (R-141).
  const contact = (await outreachContactOverlay([{ id, contactId: raw.contactId, clientLeadId: raw.clientLeadId }])).get(id)
  const lead = contact
    ? { ...raw, contactId: contact.contactId, email: contact.email ?? raw.email, phone: contact.phone ?? raw.phone }
    : raw

  // Hovory (116), e-maily (119) a schůzka (115) nemusí na každé databázi být.
  const [calls, emails, meetings] = await batchTolerant([
    {
      text: `SELECT to_jsonb(c) AS row FROM outreach_calls c
              WHERE lead_external_id = $1
              ORDER BY called_at DESC NULLS LAST, report_date DESC`,
      params: [lead.externalId],
    },
    {
      text: `SELECT to_jsonb(e) AS row FROM outreach_emails e
              WHERE lead_external_id = $1
              ORDER BY coalesce(sent_at, scheduled_for, received_at) DESC`,
      params: [lead.externalId],
    },
    {
      text: `SELECT starts_at, meet_url, invite_status FROM calendar_events
              WHERE outreach_lead_id = $1::uuid
              ORDER BY (starts_at >= now()) DESC, abs(extract(epoch FROM starts_at - now()))
              LIMIT 1`,
      params: [id],
    },
  ])
  const m = meetings[0]
  return {
    lead,
    calls: calls.map((r) => toCallView(obj(r.row))),
    emails: emails.map((r) => toEmailView(obj(r.row))),
    meeting: m && iso(m.starts_at)
      ? { startsAt: iso(m.starts_at) as string, meetUrl: str(m.meet_url), inviteStatus: str(m.invite_status) }
      : null,
  }
}

/** uuid firmy podle klíče z Growth OS (odkaz z reportu na detail). */
export async function leadIdsByExternal(externalIds: string[]): Promise<Map<string, string>> {
  if (externalIds.length === 0) return new Map()
  try {
    const rows = await adminDb<{ id: string; external_id: string }>`
      SELECT id::text, external_id FROM outreach_leads WHERE external_id = ANY(${[...new Set(externalIds)]}::text[])
    `
    return new Map(rows.map((r) => [r.external_id, r.id]))
  } catch (err) {
    if (isMissing(err)) return new Map()
    throw err
  }
}

/** Adresa náhledu ukázky (ověřuje ji proxy). */
export async function loadDemoPreviewUrl(leadId: string): Promise<string | null> {
  if (!UUID.test(leadId)) return null
  try {
    const rows = await adminDb<{ url: string | null }>`
      SELECT to_jsonb(l)->>'demo_preview_url' AS url FROM outreach_leads l WHERE id = ${leadId}::uuid
    `
    return rows[0]?.url ?? null
  } catch (err) {
    if (isMissing(err)) return null
    throw err
  }
}

// ─── Přehled ─────────────────────────────────────────────────────────────────

export type CallStats = { calls: number; connected: number; accepted: number; costCzk: number | null }

export type RecentCall = {
  rowId: string
  leadId: string | null
  company: string
  calledAt: string | null
  date: string
  result: string
  durationS: number | null
  chanceLevel: string | null
}

export type OverviewFunnel = {
  dialed: number
  reached: number
  accepted: number
  demoSent: number
  opened: number
  interested: number
  won: number
}

export type ProviderAccount = {
  odorikBalanceCzk: number | null
  elevenlabsCreditsLeft: number | null
  elevenlabsCreditsLimit: number | null
  checkedAt: string | null
}

export type Overview = {
  available: boolean
  today: CallStats
  week: CallStats
  funnel: OverviewFunnel
  queue: OutreachQueueRow[]
  queueTotal: number
  recentCalls: RecentCall[]
  lastSync: { leads: string | null; reports: string | null; calls: string | null }
  account: ProviderAccount | null
}

const NOT_CONNECTED_SQL = `('nezvedl', 'záznamník', 'chyba', 'čeká')`
const FUNNEL_DAYS = 30

function callStats(r: Json | undefined): CallStats {
  return {
    calls: Number(r?.calls ?? 0),
    connected: Number(r?.connected ?? 0),
    accepted: Number(r?.accepted ?? 0),
    costCzk: num(r?.cost_czk),
  }
}

/** Přehled: dnešek a týden z hovorů, cesta k zakázce za 30 dní, fronta, poslední hovory, provoz. */
export async function loadOverview(now: Date = new Date()): Promise<Overview> {
  const empty: Overview = {
    available: false,
    today: callStats(undefined),
    week: callStats(undefined),
    funnel: { dialed: 0, reached: 0, accepted: 0, demoSent: 0, opened: 0, interested: 0, won: 0 },
    queue: [],
    queueTotal: 0,
    recentCalls: [],
    lastSync: { leads: null, reports: null, calls: null },
    account: null,
  }

  let funnelRow: Json | undefined
  let leadsSync: unknown
  try {
    const [funnel] = await adminDb.batch([
      {
        text: `
          SELECT
            count(*) FILTER (WHERE attempts > 0 OR last_call_at IS NOT NULL)::int AS dialed,
            count(*) FILTER (WHERE status NOT IN ('new', 'scheduled', 'no_answer', 'voicemail'))::int AS reached,
            count(*) FILTER (WHERE status = ANY (${ACCEPTED_SQL}) OR demo_url IS NOT NULL)::int AS accepted,
            count(*) FILTER (WHERE demo_email_sent_at IS NOT NULL)::int AS demo_sent,
            count(*) FILTER (WHERE demo_views > 0 OR email_opened_at IS NOT NULL OR email_clicked_at IS NOT NULL)::int AS opened,
            count(*) FILTER (WHERE email_replied_at IS NOT NULL OR (${J}->>'meeting_at') IS NOT NULL
                              OR status IN ('replied', 'meeting_booked', 'meeting_held', 'won')
                              OR handled_reason = 'prevzato')::int AS interested,
            count(*) FILTER (WHERE status = 'won')::int AS won,
            (SELECT max(received_at) FROM outreach_leads) AS last_sync
            FROM outreach_leads l
           WHERE coalesce(last_call_at, source_updated_at) >= now() - make_interval(days => ${FUNNEL_DAYS})`,
        params: [],
      },
    ])
    funnelRow = funnel[0] as Json | undefined
    leadsSync = funnelRow?.last_sync
  } catch (err) {
    if (isMissing(err)) return empty
    throw err
  }

  const todayStart = `date_trunc('day', now() AT TIME ZONE 'Europe/Prague') AT TIME ZONE 'Europe/Prague'`
  const statsSql = (from: string) => `
    SELECT count(*)::int AS calls,
           count(*) FILTER (WHERE result NOT IN ${NOT_CONNECTED_SQL})::int AS connected,
           count(*) FILTER (WHERE result = 'SOUHLAS')::int AS accepted,
           sum((to_jsonb(c)->>'cost_czk')::numeric) AS cost_czk
      FROM outreach_calls c
     WHERE coalesce(called_at, report_date::timestamptz) >= ${from}`

  const [today, week, recent, sync, account] = await batchTolerant([
    { text: statsSql(todayStart), params: [] },
    { text: statsSql(`${todayStart} - interval '6 days'`), params: [] },
    {
      text: `
        SELECT c.id::text AS row_id, l.id::text AS lead_id, c.company_name, c.called_at, c.report_date,
               c.result, c.duration_s, c.chance_level
          FROM outreach_calls c
          LEFT JOIN outreach_leads l ON l.external_id = c.lead_external_id
         ORDER BY c.called_at DESC NULLS LAST, c.report_date DESC
         LIMIT 8`,
      params: [],
    },
    {
      text: `SELECT (SELECT max(received_at) FROM outreach_reports) AS reports,
                    (SELECT max(received_at) FROM outreach_calls) AS calls`,
      params: [],
    },
    {
      text: `SELECT stats->'account' AS account FROM outreach_reports
              WHERE stats ? 'account' AND jsonb_typeof(stats->'account') = 'object'
              ORDER BY generated_at DESC LIMIT 1`,
      params: [],
    },
  ])

  const queue = await loadOutreachQueue(now)
  const f = funnelRow ?? {}
  const a = account[0] ? obj(account[0].account) : null

  return {
    available: true,
    today: callStats(today[0] as Json | undefined),
    week: callStats(week[0] as Json | undefined),
    funnel: {
      dialed: Number(f.dialed ?? 0),
      reached: Number(f.reached ?? 0),
      accepted: Number(f.accepted ?? 0),
      demoSent: Number(f.demo_sent ?? 0),
      opened: Number(f.opened ?? 0),
      interested: Number(f.interested ?? 0),
      won: Number(f.won ?? 0),
    },
    queue: queue.rows.slice(0, 5),
    queueTotal: queue.rows.length,
    recentCalls: recent.map((r) => ({
      rowId: String(r.row_id),
      leadId: str(r.lead_id),
      company: String(r.company_name ?? ''),
      calledAt: iso(r.called_at),
      date: day(r.report_date),
      result: String(r.result ?? ''),
      durationS: num(r.duration_s),
      chanceLevel: str(r.chance_level),
    })),
    lastSync: { leads: iso(leadsSync), reports: iso(sync[0]?.reports), calls: iso(sync[0]?.calls) },
    account: a
      ? {
          odorikBalanceCzk: num(a.odorik_balance_czk),
          elevenlabsCreditsLeft: num(a.elevenlabs_credits_left),
          elevenlabsCreditsLimit: num(a.elevenlabs_credits_limit),
          checkedAt: iso(a.checked_at),
        }
      : null,
  }
}

export const OVERVIEW_FUNNEL_DAYS = FUNNEL_DAYS
