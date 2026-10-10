import 'server-only'
import { q, wsDb, type WsRow } from './db'
import type { WsBusiness, WsContext } from './context'

// Detail zakázky v aplikaci (S16): zprávy pro zákazníka, odkaz na výsledek,
// hodnocení a odkaz do klientského portálu. Vše s filtrem účtu a byznysu.

type Biz = Pick<WsBusiness, 'id'>

export type JobUpdateItem = { id: string; body: string; at: Date }

export type JobDetail = {
  id: string
  title: string
  stageName: string | null
  stageType: string | null
  customerId: string | null
  customerName: string | null
  customerEmail: boolean
  price: number | null
  currency: string
  resultUrl: string | null
  publicToken: string
  requestId: string | null
  nextStart: Date | null
  updates: JobUpdateItem[]
  review: { score: number; comment: string | null; at: Date } | null
}

export async function getJobDetail(ctx: WsContext, business: Biz, id: string, now: Date = new Date()): Promise<JobDetail | null> {
  const acc = ctx.accountId
  const biz = business.id
  const [rows, updates, reviews] = await wsDb(ctx).batch([
    q`SELECT j.id, j.title, j.price, j.currency, j.result_url, j.public_token, j.request_id, j.customer_id,
             st.name AS stage_name, st.type AS stage_type, c.name AS customer_name, c.email IS NOT NULL AS has_email,
             (SELECT min(a.starts_at) FROM ws.appointments a WHERE a.account_id = j.account_id AND a.job_id = j.id
                AND a.status = 'confirmed' AND a.ends_at > ${now}::timestamptz) AS next_start
      FROM ws.jobs j
      LEFT JOIN ws.stages st ON st.account_id = j.account_id AND st.id = j.stage_id
      LEFT JOIN ws.customers c ON c.account_id = j.account_id AND c.id = j.customer_id
      WHERE j.account_id = ${acc} AND j.business_id = ${biz} AND j.id = ${id}`,
    q`SELECT id, body, created_at FROM ws.job_updates
      WHERE account_id = ${acc} AND business_id = ${biz} AND job_id = ${id} AND deleted_at IS NULL
      ORDER BY created_at DESC LIMIT 50`,
    q`SELECT score, comment, created_at FROM ws.reviews WHERE account_id = ${acc} AND business_id = ${biz} AND job_id = ${id}`,
  ])
  const r = (rows as WsRow[])[0]
  if (!r) return null
  const rv = (reviews as WsRow[])[0]
  return {
    id: String(r.id),
    title: String(r.title),
    stageName: (r.stage_name as string | null) ?? null,
    stageType: (r.stage_type as string | null) ?? null,
    customerId: (r.customer_id as string | null) ?? null,
    customerName: (r.customer_name as string | null) ?? null,
    customerEmail: Boolean(r.has_email),
    price: r.price === null || r.price === undefined ? null : Number(r.price),
    currency: String(r.currency),
    resultUrl: (r.result_url as string | null) ?? null,
    publicToken: String(r.public_token),
    requestId: (r.request_id as string | null) ?? null,
    nextStart: (r.next_start as Date | null) ?? null,
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
