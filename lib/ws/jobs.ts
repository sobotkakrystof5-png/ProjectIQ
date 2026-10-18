import 'server-only'
import { q, wsDb, type WsRow } from './db'
import type { WsBusiness, WsContext } from './context'

// Detail zakázky v aplikaci (S16): zprávy pro zákazníka, odkaz na výsledek,
// hodnocení a odkaz do klientského portálu. Vše s filtrem účtu a byznysu.

type Biz = Pick<WsBusiness, 'id'>

export type JobUpdateItem = { id: string; body: string; at: Date }

/** Jedna změna stavu z historie (nejnovější první); `from` je null u první změny bez známého stavu. */
export type JobHistoryItem = { at: Date; from: string | null; to: string }

export type JobDetail = {
  id: string
  title: string
  stageId: string | null
  stageName: string | null
  stageType: string | null
  /** Všechny stavy byznysu (výběr „Přesunout do stavu“ v panelu). */
  stages: { id: string; name: string; type: string }[]
  createdAt: Date
  closedAt: Date | null
  customerId: string | null
  customerName: string | null
  customerEmail: boolean
  price: number | null
  currency: string
  resultUrl: string | null
  publicToken: string
  requestId: string | null
  nextStart: Date | null
  /** Konec posledního domluveného termínu, i proběhlého. */
  lastEnd: Date | null
  /** Zaznamenané změny stavu od zavedení historie (RD06), nejnovější první. */
  history: JobHistoryItem[]
  updates: JobUpdateItem[]
  review: { score: number; comment: string | null; at: Date } | null
}

export async function getJobDetail(ctx: WsContext, business: Biz, id: string, now: Date = new Date()): Promise<JobDetail | null> {
  const acc = ctx.accountId
  const biz = business.id
  const [rows, updates, reviews, stages, history] = await wsDb(ctx).batch([
    q`SELECT j.id, j.title, j.price, j.currency, j.result_url, j.public_token, j.request_id, j.customer_id,
             j.stage_id, j.created_at, j.closed_at,
             st.name AS stage_name, st.type AS stage_type, c.name AS customer_name, c.email IS NOT NULL AS has_email,
             (SELECT min(a.starts_at) FROM ws.appointments a WHERE a.account_id = j.account_id AND a.job_id = j.id
                AND a.status = 'confirmed' AND a.ends_at > ${now}::timestamptz) AS next_start,
             (SELECT max(a.ends_at) FROM ws.appointments a WHERE a.account_id = j.account_id AND a.job_id = j.id
                AND a.status = 'confirmed') AS last_end
      FROM ws.jobs j
      LEFT JOIN ws.stages st ON st.account_id = j.account_id AND st.id = j.stage_id
      LEFT JOIN ws.customers c ON c.account_id = j.account_id AND c.id = j.customer_id
      WHERE j.account_id = ${acc} AND j.business_id = ${biz} AND j.id = ${id}`,
    q`SELECT id, body, created_at FROM ws.job_updates
      WHERE account_id = ${acc} AND business_id = ${biz} AND job_id = ${id} AND deleted_at IS NULL
      ORDER BY created_at DESC LIMIT 50`,
    q`SELECT score, comment, created_at FROM ws.reviews WHERE account_id = ${acc} AND business_id = ${biz} AND job_id = ${id}`,
    q`SELECT id, name, type FROM ws.stages WHERE account_id = ${acc} AND business_id = ${biz} ORDER BY position, created_at`,
    q`SELECT created_at, details FROM ws.audit_log
      WHERE account_id = ${acc} AND business_id = ${biz} AND entity = 'job' AND entity_id = ${id} AND action = 'job.stage_changed'
      ORDER BY created_at DESC LIMIT 15`,
  ])
  const r = (rows as WsRow[])[0]
  if (!r) return null
  const rv = (reviews as WsRow[])[0]
  return {
    id: String(r.id),
    title: String(r.title),
    stageId: (r.stage_id as string | null) ?? null,
    stageName: (r.stage_name as string | null) ?? null,
    stageType: (r.stage_type as string | null) ?? null,
    stages: (stages as WsRow[]).map((x) => ({ id: String(x.id), name: String(x.name), type: String(x.type) })),
    createdAt: r.created_at as Date,
    closedAt: (r.closed_at as Date | null) ?? null,
    customerId: (r.customer_id as string | null) ?? null,
    customerName: (r.customer_name as string | null) ?? null,
    customerEmail: Boolean(r.has_email),
    price: r.price === null || r.price === undefined ? null : Number(r.price),
    currency: String(r.currency),
    resultUrl: (r.result_url as string | null) ?? null,
    publicToken: String(r.public_token),
    requestId: (r.request_id as string | null) ?? null,
    nextStart: (r.next_start as Date | null) ?? null,
    lastEnd: (r.last_end as Date | null) ?? null,
    history: (history as WsRow[]).map((h) => {
      const d = (h.details ?? {}) as { from?: { name?: string | null } | null; to?: { name?: string | null } | null }
      return { at: h.created_at as Date, from: d.from?.name ?? null, to: d.to?.name ?? '?' }
    }),
    updates: (updates as WsRow[]).map((u) => ({ id: String(u.id), body: String(u.body), at: u.created_at as Date })),
    review: rv ? { score: Number(rv.score), comment: (rv.comment as string | null) ?? null, at: rv.created_at as Date } : null,
  }
}

/** Nová zpráva pro zákazníka. null = zakázka tu není. */
export async function addJobUpdate(ctx: WsContext, business: Biz, jobId: string, body: string): Promise<string | null> {
  const rows = await wsDb(ctx)`
    INSERT INTO ws.job_updates (account_id, business_id, job_id, body)
    SELECT ${ctx.accountId}, ${business.id}, j.id, ${body}
    FROM ws.jobs j WHERE j.account_id = ${ctx.accountId} AND j.business_id = ${business.id} AND j.id = ${jobId}
    RETURNING id`
  return rows[0] ? String(rows[0].id) : null
}

/** Smazání zprávy (a „Zpět“): jen značka, zákazník ji přestane vidět. */
export async function setJobUpdateDeleted(ctx: WsContext, business: Biz, updateId: string, deleted: boolean): Promise<boolean> {
  const rows = await wsDb(ctx)`
    UPDATE ws.job_updates SET deleted_at = CASE WHEN ${deleted} THEN now() ELSE NULL END
    WHERE account_id = ${ctx.accountId} AND business_id = ${business.id} AND id = ${updateId}
    RETURNING id`
  return rows.length > 0
}

export async function setJobResultUrl(ctx: WsContext, business: Biz, jobId: string, url: string | null): Promise<boolean> {
  const rows = await wsDb(ctx)`
    UPDATE ws.jobs SET result_url = ${url}
    WHERE account_id = ${ctx.accountId} AND business_id = ${business.id} AND id = ${jobId}
    RETURNING id`
  return rows.length > 0
}

/** Odkaz do portálu a hodnocení u termínu (detail termínu v aplikaci). */
export async function getAppointmentPortal(
  ctx: WsContext,
  business: Biz,
  appointmentId: string,
): Promise<{ publicToken: string; review: { score: number; comment: string | null } | null } | null> {
  const [rows, reviews] = await wsDb(ctx).batch([
    q`SELECT public_token FROM ws.appointments
      WHERE account_id = ${ctx.accountId} AND business_id = ${business.id} AND id = ${appointmentId} AND kind = 'visit'`,
    q`SELECT score, comment FROM ws.reviews
      WHERE account_id = ${ctx.accountId} AND business_id = ${business.id} AND appointment_id = ${appointmentId}`,
  ])
  const r = (rows as WsRow[])[0]
  if (!r) return null
  const rv = (reviews as WsRow[])[0]
  return {
    publicToken: String(r.public_token),
    review: rv ? { score: Number(rv.score), comment: (rv.comment as string | null) ?? null } : null,
  }
}
