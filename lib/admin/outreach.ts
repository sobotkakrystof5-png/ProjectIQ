import 'server-only'
import { adminDb, batchTolerant } from '@/lib/admin/db'
import type { OutreachLeadPayload } from '@/types/outreach'
import {
  callRecord,
  emailRecord,
  pragueDate,
  upsertOutreachCalls,
  upsertOutreachEmails,
} from '@/lib/admin/outreach-calls'
import {
  CLOSED_STATUSES,
  QUEUE_STATUSES,
  queueReason,
  sortQueue,
  type OutreachQueueRow,
} from '@/lib/admin/outreach-view'

export { formatWhen, queueReason, sortQueue, QUEUE_STATUSES } from '@/lib/admin/outreach-view'
export type { OutreachQueueRow, QueueReason } from '@/lib/admin/outreach-view'

/**
 * Hovory od asistenta (R-112).
 *
 * Growth OS (vizeon-autopilot) obvolává firmy přes AI agenta, staví jim
 * ukázkové weby a posílá e-maily. Sem posílá snímky stavu každé firmy
 * (`/api/public/outreach`) a admin z nich staví frontu „Komu zavolat".
 *
 * Pravidla:
 *  1. D1 v Growth OS rozhoduje, komu volá robot. Tady se to jen čte.
 *  2. `call_summary` je text od modelu o skutečném člověku — jen text,
 *     nikdy HTML, a klientovi se neposílá.
 *  3. Snímek nikdy nepřepíše, co s firmou udělal Kryštof (`handled_*`,
 *     `client_lead_id`). Výjimka: firma, kterou odložil jako „nemá zájem",
 *     se vrátí do fronty, když nově odpoví na e-mail.
 */

// ─── Fronta ──────────────────────────────────────────────────────────────────

export const QUEUE_WHERE = `
  handled_at IS NULL
  AND do_not_call = false
  AND status <> ALL ('{${CLOSED_STATUSES.join(',')}}'::text[])
  AND (
    status = ANY ('{${QUEUE_STATUSES.join(',')}}'::text[])
    OR email_replied_at IS NOT NULL
    OR demo_views > 0
  )`

function str(v: unknown): string | null {
  return v === null || v === undefined || v === '' ? null : String(v)
}

function iso(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const d = v instanceof Date ? v : new Date(String(v))
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function toQueueRow(raw: Record<string, unknown>): OutreachQueueRow {
  return {
    id: String(raw.id),
    company: String(raw.company_name ?? ''),
    contactName: str(raw.contact_name),
    phone: str(raw.phone),
    email: str(raw.email),
    website: str(raw.website),
    industry: str(raw.industry),
    city: str(raw.city),
    status: String(raw.status ?? ''),
    attempts: Number(raw.attempts ?? 0),
    lastCallAt: iso(raw.last_call_at),
    callSummary: str(raw.call_summary),
    callbackAt: iso(raw.callback_at),
    callbackText: str(raw.callback_text),
    demoUrl: str(raw.demo_url),
    demoStatus: str(raw.demo_status),
    demoViews: Number(raw.demo_views ?? 0),
    demoFirstViewedAt: iso(raw.demo_first_viewed_at),
    demoEmailSentAt: iso(raw.demo_email_sent_at),
    emailOpenedAt: iso(raw.email_opened_at),
    emailClickedAt: iso(raw.email_clicked_at),
    emailRepliedAt: iso(raw.email_replied_at),
    receivedAt: iso(raw.received_at) ?? new Date(0).toISOString(),
  }
}

export type OutreachQueue = {
  rows: OutreachQueueRow[]
  /** false = migrace 114 ještě neběžela; záložka se neukáže. */
  available: boolean
}

/** Strop fronty. Víc firem najednou nikdo neobvolá. */
const QUEUE_LIMIT = 100

/** Fronta „Komu zavolat", seřazená podle naléhavosti. */
export async function loadOutreachQueue(now: Date = new Date()): Promise<OutreachQueue> {
  try {
    const [rows] = await adminDb.batch([
      {
        text: `SELECT id::text, company_name, contact_name, phone, email, website, industry, city, status,
                      attempts, last_call_at, call_summary, callback_at, callback_text, demo_url, demo_status,
                      demo_views, demo_first_viewed_at, demo_email_sent_at, email_opened_at, email_clicked_at,
                      email_replied_at, received_at
                 FROM outreach_leads
                WHERE ${QUEUE_WHERE}
                ORDER BY received_at DESC
                LIMIT ${QUEUE_LIMIT}`,
        params: [],
      },
    ])
    return { rows: sortQueue((rows as Record<string, unknown>[]).map(toQueueRow), now), available: true }
  } catch (err) {
    if ((err as { code?: string })?.code === '42P01') return { rows: [], available: false }
    throw err
  }
}

/** Jen počet pro záložku v Hovorech. */
export async function countOutreachQueue(): Promise<number | null> {
  const [rows] = await batchTolerant([
    { text: `SELECT count(*)::int AS pocet FROM outreach_leads WHERE ${QUEUE_WHERE}`, params: [] },
  ])
  const first = (rows as { pocet?: number }[] | undefined)?.[0]
  return first ? Number(first.pocet ?? 0) : null
}

// ─── Příjem snímků z Growth OS ───────────────────────────────────────────────

type Prev = {
  external_id: string
  status: string
  do_not_call: boolean
  demo_views: number
  email_replied_at: unknown
  handled_at: unknown
}

export type OutreachEvent = (
  | { kind: 'do-fronty'; company: string; reason: string }
  | { kind: 'otevrel-ukazku'; company: string }
  | { kind: 'odpovedel'; company: string }
) & {
  /** uuid řádku — odkaz z oznámení vede rovnou na detail klienta (R-120). */
  leadId?: string
}

export type IngestResult = { received: number; saved: number; calls: number; emails: number; events: OutreachEvent[] }

function inQueue(p: { status: string; do_not_call: boolean; demo_views: number; replied: boolean; handled: boolean }): boolean {
  if (p.handled || p.do_not_call) return false
  if ((CLOSED_STATUSES as readonly string[]).includes(p.status)) return false
  return (QUEUE_STATUSES as readonly string[]).includes(p.status) || p.replied || p.demo_views > 0
}

/** Z dávky vezme pro každou firmu jen nejnovější snímek (ON CONFLICT by na dvojici spadl). */
export function latestPerLead(leads: OutreachLeadPayload[]): OutreachLeadPayload[] {
  const byId = new Map<string, OutreachLeadPayload>()
  for (const lead of leads) {
    const prev = byId.get(lead.external_id)
    if (!prev || Date.parse(lead.updated_at) >= Date.parse(prev.updated_at)) byId.set(lead.external_id, lead)
  }
  return [...byId.values()]
}

function toRecord(lead: OutreachLeadPayload, version = 1) {
  return {
    external_id: lead.external_id,
    source_updated_at: lead.updated_at,
    company_name: lead.company,
    contact_name: lead.contact_name ?? null,
    phone: lead.phone ?? null,
    email: lead.email ?? null,
    website: lead.website ?? null,
    industry: lead.industry ?? null,
    city: lead.city ?? null,
    status: lead.status,
    do_not_call: lead.do_not_call || lead.status === 'do_not_call',
    attempts: lead.attempts,
    last_call_at: lead.last_call?.at ?? null,
    last_outcome: lead.last_call?.outcome ?? null,
    call_summary: lead.last_call?.summary ?? null,
    callback_at: lead.last_call?.callback_at ?? null,
    callback_text: lead.last_call?.callback_text ?? null,
    demo_url: lead.demo?.url ?? null,
    demo_status: lead.demo?.status ?? null,
    demo_built_at: lead.demo?.built_at ?? null,
    demo_views: lead.demo?.views ?? 0,
    demo_first_viewed_at: lead.demo?.first_viewed_at ?? null,
    cold_email_sent_at: lead.emails?.cold_sent_at ?? null,
    demo_email_sent_at: lead.emails?.demo_sent_at ?? null,
    email_opened_at: lead.emails?.opened_at ?? null,
    email_clicked_at: lead.emails?.clicked_at ?? null,
    email_replied_at: lead.emails?.replied_at ?? null,
    // v2 (migrace 119)
    segment: lead.segment ?? null,
    source_batch: lead.source_batch ?? null,
    next_call_after: lead.next_call_after ?? null,
    meeting_at: lead.meeting_at ?? null,
    demo_slug: lead.demo?.slug ?? null,
    demo_preview_url: lead.demo?.preview_url ?? null,
    demo_last_viewed_at: lead.demo?.last_viewed_at ?? null,
    demo_max_view_s: lead.demo?.max_view_s ?? null,
    // Sloupec je NOT NULL; prázdné pole v UPDATE nic nepřepíše.
    status_history: lead.status_history ?? [],
    research: lead.research ?? null,
    snapshot_version: version,
  }
}

const RECORD_COLUMNS = `
  external_id text, source_updated_at timestamptz, company_name text, contact_name text, phone text,
  email text, website text, industry text, city text, status text, do_not_call boolean, attempts integer,
  last_call_at timestamptz, last_outcome text, call_summary text, callback_at timestamptz, callback_text text,
  demo_url text, demo_status text, demo_built_at timestamptz, demo_views integer,
  demo_first_viewed_at timestamptz, cold_email_sent_at timestamptz, demo_email_sent_at timestamptz,
  email_opened_at timestamptz, email_clicked_at timestamptz, email_replied_at timestamptz`

const RECORD_COLUMNS_V2 = `${RECORD_COLUMNS},
  segment text, source_batch text, next_call_after timestamptz, meeting_at timestamptz, demo_slug text,
  demo_preview_url text, demo_last_viewed_at timestamptz, demo_max_view_s integer, status_history jsonb,
  research jsonb, snapshot_version integer`

/**
 * Sloupce v2. Snímek v1 (starší Growth OS) je nepřepíše; v2 je přepíše vždy,
 * kromě historie stavů a rešerše, které chybějící hodnota nesmaže.
 */
const DATA_COLUMNS_V2 = [
  'segment', 'source_batch', 'next_call_after', 'meeting_at', 'demo_slug', 'demo_preview_url',
  'demo_last_viewed_at', 'demo_max_view_s', 'status_history', 'research', 'snapshot_version',
] as const

function v2UpdateExpr(c: (typeof DATA_COLUMNS_V2)[number]): string {
  if (c === 'snapshot_version') return `${c} = EXCLUDED.${c}`
  if (c === 'status_history') {
    return `${c} = CASE WHEN EXCLUDED.${c} IS NOT NULL AND jsonb_array_length(EXCLUDED.${c}) > 0 THEN EXCLUDED.${c} ELSE outreach_leads.${c} END`
  }
  if (c === 'research') return `${c} = coalesce(EXCLUDED.${c}, outreach_leads.${c})`
  return `${c} = CASE WHEN EXCLUDED.snapshot_version >= 2 THEN EXCLUDED.${c} ELSE outreach_leads.${c} END`
}

const DATA_COLUMNS = [
  'source_updated_at', 'company_name', 'contact_name', 'phone', 'email', 'website', 'industry', 'city', 'status',
  'do_not_call', 'attempts', 'last_call_at', 'last_outcome', 'call_summary', 'callback_at', 'callback_text',
  'demo_url', 'demo_status', 'demo_built_at', 'demo_views', 'demo_first_viewed_at', 'cold_email_sent_at',
  'demo_email_sent_at', 'email_opened_at', 'email_clicked_at', 'email_replied_at',
] as const

/**
 * Uloží dávku snímků. Celá dávka je jeden INSERT … SELECT z JSON (jedno kolo
 * do databáze), starší snímek novější nepřepíše. Vrací události pro oznámení:
 * firma nově ve frontě, poprvé otevřená ukázka, nová odpověď na e-mail.
 */
export async function ingestOutreachLeads(input: OutreachLeadPayload[], version = 1): Promise<IngestResult> {
  const leads = latestPerLead(input)
  const ids = leads.map((l) => l.external_id)

  const prevRows = await adminDb<Prev>`
    SELECT external_id, status, do_not_call, demo_views, email_replied_at, handled_at
      FROM outreach_leads WHERE external_id = ANY(${ids}::text[])
  `
  const prev = new Map(prevRows.map((r) => [r.external_id, r]))

  const records = leads.map((l) => toRecord(l, version))
  let saved: { external_id: string; id: string }[]
  let v2 = true
  try {
    saved = await upsertLeads(records, true)
  } catch (err) {
    // Bez migrace 119 se snímek uloží jako v1 (bez hovorů a e-mailů).
    if ((err as { code?: string })?.code !== '42703') throw err
    v2 = false
    saved = await upsertLeads(records, false)
  }
  const savedIds = new Set(saved.map((r) => r.external_id))

  // Hovory a e-maily jen u firem, jejichž snímek se opravdu uložil: starší
  // snímek by jinak vrátil „čeká" přes skutečný výsledek hovoru.
  let calls = 0
  let emails = 0
  const fresh = leads.filter((l) => savedIds.has(l.external_id))
  const callRecords = fresh.flatMap((l) =>
    (l.calls ?? []).map((c) =>
      callRecord(c, {
        leadExternalId: l.external_id,
        company: l.company,
        date: pragueDate(c.at ?? l.updated_at),
      }),
    ),
  )
  if (callRecords.length) {
    try {
      calls = await upsertOutreachCalls(callRecords)
    } catch (err) {
      // Bez migrace 116 (tabulka hovorů) snímek firmy stejně platí.
      if ((err as { code?: string })?.code !== '42P01') throw err
    }
  }
  if (v2) {
    const emailRecords = fresh.flatMap((l) => (l.email_log ?? []).map((e) => emailRecord(e, l.external_id)))
    emails = await upsertOutreachEmails(emailRecords)
  }

  const idByExternal = new Map(saved.map((r) => [r.external_id, r.id]))
  const events: OutreachEvent[] = collectEvents(leads, savedIds, prev).map(({ externalId, ...e }) => ({
    ...e,
    leadId: idByExternal.get(externalId),
  }))
  return { received: input.length, saved: savedIds.size, calls, emails, events }
}

async function upsertLeads(records: ReturnType<typeof toRecord>[], v2: boolean): Promise<{ external_id: string; id: string }[]> {
  const dataColumns: string[] = [...DATA_COLUMNS, ...(v2 ? DATA_COLUMNS_V2 : [])]
  const allColumns = ['external_id', ...dataColumns]
  const rows = v2
    ? records
    : records.map((r) => Object.fromEntries(allColumns.map((c) => [c, (r as Record<string, unknown>)[c]])))
  const [saved] = await adminDb.batch([
    {
      text: `
        INSERT INTO outreach_leads (${allColumns.join(', ')})
        SELECT ${allColumns.join(', ')}
          FROM jsonb_to_recordset($1::jsonb) AS x(${v2 ? RECORD_COLUMNS_V2 : RECORD_COLUMNS})
        ON CONFLICT (external_id) DO UPDATE SET
          ${DATA_COLUMNS.map((c) => `${c} = EXCLUDED.${c}`).join(',\n          ')},
          ${v2 ? `${DATA_COLUMNS_V2.map(v2UpdateExpr).join(',\n          ')},` : ''}
          -- „Nemá zájem" se vrací do fronty, když firma nově odpoví na e-mail.
          handled_at = CASE
            WHEN outreach_leads.handled_reason = 'nezajem'
             AND EXCLUDED.email_replied_at IS NOT NULL
             AND outreach_leads.email_replied_at IS NULL
            THEN NULL ELSE outreach_leads.handled_at END,
          handled_reason = CASE
            WHEN outreach_leads.handled_reason = 'nezajem'
             AND EXCLUDED.email_replied_at IS NOT NULL
             AND outreach_leads.email_replied_at IS NULL
            THEN NULL ELSE outreach_leads.handled_reason END,
          received_at = now(),
          updated_at = now()
        WHERE outreach_leads.source_updated_at <= EXCLUDED.source_updated_at
        RETURNING external_id, id::text AS id`,
      params: [JSON.stringify(rows)],
    },
  ])
  return saved as { external_id: string; id: string }[]
}

function collectEvents(
  leads: OutreachLeadPayload[],
  savedIds: Set<string>,
  prev: Map<string, Prev>,
): (OutreachEvent & { externalId: string })[] {
  const events: (OutreachEvent & { externalId: string })[] = []
  for (const lead of leads) {
    if (!savedIds.has(lead.external_id)) continue
    const before = prev.get(lead.external_id)
    const rec = toRecord(lead)
    const replied = rec.email_replied_at !== null
    const reopened = before !== undefined && before.handled_at !== null && replied && before.email_replied_at === null
    const nowIn = inQueue({
      status: rec.status,
      do_not_call: rec.do_not_call,
      demo_views: rec.demo_views,
      replied,
      handled: before ? before.handled_at !== null && !reopened : false,
    })
    if (!nowIn) continue

    if (replied && (!before || before.email_replied_at === null)) {
      events.push({ kind: 'odpovedel', company: rec.company_name, externalId: rec.external_id })
      continue
    }
    if (rec.demo_views > 0 && (!before || Number(before.demo_views) === 0)) {
      events.push({ kind: 'otevrel-ukazku', company: rec.company_name, externalId: rec.external_id })
      continue
    }
    const wasIn =
      before !== undefined &&
      inQueue({
        status: before.status,
        do_not_call: before.do_not_call,
        demo_views: Number(before.demo_views),
        replied: before.email_replied_at !== null,
        handled: before.handled_at !== null,
      })
    if (!wasIn) {
      const reason = queueReason({
        id: '',
        company: rec.company_name,
        contactName: null,
        phone: null,
        email: null,
        website: null,
        industry: null,
        city: null,
        status: rec.status,
        attempts: rec.attempts,
        lastCallAt: rec.last_call_at,
        callSummary: null,
        callbackAt: rec.callback_at,
        callbackText: rec.callback_text,
        demoUrl: null,
        demoStatus: rec.demo_status,
        demoViews: rec.demo_views,
        demoFirstViewedAt: null,
        demoEmailSentAt: rec.demo_email_sent_at,
        emailOpenedAt: rec.email_opened_at,
        emailClickedAt: rec.email_clicked_at,
        emailRepliedAt: rec.email_replied_at,
        receivedAt: new Date().toISOString(),
      })
      events.push({ kind: 'do-fronty', company: rec.company_name, reason: reason.label, externalId: rec.external_id })
    }
  }
  return events
}

// ─── Akce Kryštofa ───────────────────────────────────────────────────────────

export type OutreachSource = {
  company_name: string
  contact_name: string | null
  phone: string | null
  email: string | null
  website: string | null
  call_summary: string | null
  callback_at: string | Date | null
  callback_text: string | null
  demo_url: string | null
  client_lead_id: string | null
}

export async function loadOutreachSource(id: string): Promise<OutreachSource | null> {
  const rows = await adminDb<OutreachSource>`
    SELECT company_name, contact_name, phone, email, website, call_summary, callback_at, callback_text,
           demo_url, client_lead_id::text AS client_lead_id
      FROM outreach_leads WHERE id = ${id} LIMIT 1
  `
  return rows[0] ?? null
}

/** Poznámka do Hovorů: co víme z robota, odhad modelu jasně označený. */
export function takeoverNote(source: OutreachSource): string {
  return [
    'Z Growth OS (hovor AI asistenta).',
    source.callback_text?.trim() ? `Kdy chce zavolat (jeho slovy): ${source.callback_text.trim()}` : null,
    source.demo_url ? `Ukázka: ${source.demo_url}` : null,
    source.website ? `Web firmy: ${source.website}` : null,
    source.call_summary?.trim() ? `Shrnutí hovoru od AI (odhad, ne fakt): ${source.call_summary.trim()}` : null,
  ]
    .filter((line): line is string => line !== null)
    .join('\n\n')
}

export async function markOutreachHandled(
  id: string,
  reason: 'prevzato' | 'nezajem',
  clientLeadId: string | null,
): Promise<void> {
  await adminDb`
    UPDATE outreach_leads
       SET handled_at = now(), handled_reason = ${reason},
           client_lead_id = coalesce(client_lead_id, ${clientLeadId}::uuid), updated_at = now()
     WHERE id = ${id}
  `
}

export async function restoreOutreachLead(id: string): Promise<void> {
  await adminDb`
    UPDATE outreach_leads SET handled_at = NULL, handled_reason = NULL, updated_at = now()
     WHERE id = ${id} AND handled_reason = 'nezajem'
  `
}

// ─── Zpětný kanál pro Growth OS (R-120) ──────────────────────────────────────

export type HandledChange = {
  external_id: string
  /** prevzato = vede ho Kryštof, nezajem = odložil; null = vrátil se do fronty. */
  handled: 'prevzato' | 'nezajem' | null
  handled_at: string | null
  changed_at: string
  /** Schůzka, kterou Kryštof domluvil v adminu (nejbližší budoucí, jinak poslední). */
  meeting_at: string | null
}

/** Strop jedné odpovědi; Growth OS si další dotáhne s `since` = poslední `changed_at`. */
export const HANDLED_PAGE = 500

/**
 * Co Kryštof v adminu s firmami udělal od `since` — ať robot nevolá tomu,
 * koho převzal nebo odložil. Čte jen `admin_changed_at` (trigger z migrace 119),
 * seřazeno vzestupně, aby šlo stránkovat. Bez migrace 119 `null`.
 */
export async function loadHandledChanges(since: Date): Promise<HandledChange[] | null> {
  const query = (withMeeting: boolean) => ({
    text: `
      SELECT l.external_id, l.handled_reason, l.handled_at, l.admin_changed_at,
             ${
               withMeeting
                 ? `(SELECT e.starts_at FROM calendar_events e
                      WHERE e.outreach_lead_id = l.id
                      ORDER BY (e.starts_at >= now()) DESC, abs(extract(epoch FROM e.starts_at - now()))
                      LIMIT 1)`
                 : 'NULL::timestamptz'
             } AS meeting_at
        FROM outreach_leads l
       WHERE l.admin_changed_at > $1::timestamptz
       ORDER BY l.admin_changed_at ASC
       LIMIT ${HANDLED_PAGE}`,
    params: [since.toISOString()],
  })
  const missing = (err: unknown) => ['42703', '42P01'].includes((err as { code?: string })?.code ?? '')
  try {
    let rows: Record<string, unknown>[]
    try {
      ;[rows] = await adminDb.batch([query(true)])
    } catch (err) {
      // Bez migrace 115 (schůzky s Meet) zpětný kanál funguje dál, jen bez termínu.
      if (!missing(err)) throw err
      ;[rows] = await adminDb.batch([query(false)])
    }
    return rows.map((r) => ({
      external_id: String(r.external_id),
      handled: r.handled_reason === 'prevzato' || r.handled_reason === 'nezajem' ? r.handled_reason : null,
      handled_at: iso(r.handled_at),
      changed_at: iso(r.admin_changed_at) ?? new Date(0).toISOString(),
      meeting_at: iso(r.meeting_at),
    }))
  } catch (err) {
    // 42703: chybí admin_changed_at (migrace 119); 42P01: chybí tabulka (114).
    if (missing(err)) return null
    throw err
  }
}
