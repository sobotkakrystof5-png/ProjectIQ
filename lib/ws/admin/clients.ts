import 'server-only'
import { q } from '../db'
import { billingStateFrom, type BillingAccess, type SubscriptionRow } from '../billing'
import { getIndustryTemplate } from '../templates'
import { adminDb } from './db'
import { adminActor, type AdminIdentity } from './auth'

// /dashboard/klienti (S17): přehled účtů Workspace pro admina. Jen čtení
// přes vlastníka tabulek (lib/ws/admin/db.ts). Žádné údaje zákazníků klientů
// (jména, telefony, e-maily) se nenačítají — jen počty a stav.

export type ClientRow = {
  id: string
  name: string
  createdAt: Date
  industries: string[]
  businesses: number
  access: BillingAccess
  periodEnd: Date | null
  lastActivity: Date | null
  requests30d: number
  /** `used` = web už něco poslal, `ready` = napojení založené, `none` = nic. */
  web: 'used' | 'ready' | 'none'
  members: number
}

type Num = number | string | null

const toDate = (v: unknown): Date | null => (v ? new Date(v as string) : null)
const toNum = (v: Num): number => Number(v ?? 0)

function subscriptionRows(raw: unknown): SubscriptionRow[] {
  const list = Array.isArray(raw) ? (raw as Record<string, unknown>[]) : []
  return list.map((s) => ({
    status: s.status as SubscriptionRow['status'],
    current_period_end: toDate(s.current_period_end),
    cancel_at_period_end: Boolean(s.cancel_at_period_end),
    past_due_since: toDate(s.past_due_since),
    created_at: new Date(s.created_at as string),
  }))
}

// Poslední aktivita = nejnovější změna v poptávkách, termínech, zakázkách,
// zákaznících nebo fakturách (ne přihlášení — to se do ws nepíše).
const ACTIVITY_SQL = `GREATEST(
  (SELECT max(created_at) FROM ws.requests r WHERE r.account_id = a.id AND NOT r.is_test),
  (SELECT max(updated_at) FROM ws.appointments ap WHERE ap.account_id = a.id),
  (SELECT max(updated_at) FROM ws.jobs j WHERE j.account_id = a.id),
  (SELECT max(updated_at) FROM ws.customers c WHERE c.account_id = a.id),
  (SELECT max(updated_at) FROM ws.invoices i WHERE i.account_id = a.id)
)`

const LIST_SQL = `
  SELECT a.id, a.name, a.created_at,
    (SELECT coalesce(array_agg(DISTINCT b.industry), '{}') FROM ws.businesses b WHERE b.account_id = a.id AND b.archived_at IS NULL) AS industries,
    (SELECT count(*) FROM ws.businesses b WHERE b.account_id = a.id AND b.archived_at IS NULL) AS businesses,
    (SELECT coalesce(json_agg(json_build_object('status', s.status, 'current_period_end', s.current_period_end,
       'cancel_at_period_end', s.cancel_at_period_end, 'past_due_since', s.past_due_since, 'created_at', s.created_at)), '[]')
     FROM ws.subscriptions s WHERE s.account_id = a.id) AS subscriptions,
    ${ACTIVITY_SQL} AS last_activity,
    (SELECT count(*) FROM ws.requests r WHERE r.account_id = a.id AND NOT r.is_test AND r.created_at > now() - interval '30 days') AS requests_30d,
    EXISTS (SELECT 1 FROM ws.web_integrations w WHERE w.account_id = a.id AND w.active AND w.revoked_at IS NULL AND w.last_used_at IS NOT NULL) AS web_used,
    EXISTS (SELECT 1 FROM ws.web_integrations w WHERE w.account_id = a.id AND w.active AND w.revoked_at IS NULL) AS web_ready,
    (SELECT count(*) FROM ws.members m WHERE m.account_id = a.id) AS members
  FROM ws.accounts a
`

function mapClient(r: Record<string, unknown>): ClientRow {
  const billing = billingStateFrom(subscriptionRows(r.subscriptions))
  return {
    id: String(r.id),
    name: String(r.name),
    createdAt: new Date(r.created_at as string),
    industries: (r.industries as string[]).map((k) => getIndustryTemplate(k).label),
    businesses: toNum(r.businesses as Num),
    access: billing.access,
    periodEnd: billing.periodEnd,
    lastActivity: toDate(r.last_activity),
    requests30d: toNum(r.requests_30d as Num),
    web: r.web_used ? 'used' : r.web_ready ? 'ready' : 'none',
    members: toNum(r.members as Num),
  }
}

/** Všechny účty, nejnovější aktivita nahoře. */
export async function listClients(): Promise<ClientRow[]> {
  const [rows] = await adminDb.batch([{ text: `${LIST_SQL} ORDER BY last_activity DESC NULLS LAST, a.created_at DESC LIMIT 500`, params: [] }])
  return rows.map(mapClient)
}

export type ClientBusiness = { id: string; name: string; slug: string; industry: string; archived: boolean; webUsedAt: Date | null; webReady: boolean; hasSecret: boolean }
export type ClientMember = { role: 'owner' | 'staff'; name: string | null; email: string | null; createdAt: Date }
export type ClientAudit = { at: Date; actor: string; action: string }

export type ClientDetail = ClientRow & {
  ico: string | null
  newsEmails: boolean
  cancelAtPeriodEnd: boolean
  businessesList: ClientBusiness[]
  membersList: ClientMember[]
  audit: ClientAudit[]
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Detail účtu, nebo null. `accountId` z URL adminu — ověřený jen tvarem, data čte admin. */
export async function getClientDetail(accountId: string): Promise<ClientDetail | null> {
  if (!UUID_RE.test(accountId)) return null
  const [base, extra, businesses, members, audit] = await adminDb.batch([
    { text: `${LIST_SQL} WHERE a.id = $1`, params: [accountId] },
    q`SELECT a.ico, a.news_emails FROM ws.accounts a WHERE a.id = ${accountId}`,
    q`SELECT b.id, b.name, b.slug, b.industry, b.archived_at IS NOT NULL AS archived,
        (SELECT max(w.last_used_at) FROM ws.web_integrations w WHERE w.account_id = b.account_id AND w.business_id = b.id AND w.active AND w.revoked_at IS NULL) AS web_used_at,
        EXISTS (SELECT 1 FROM ws.web_integrations w WHERE w.account_id = b.account_id AND w.business_id = b.id AND w.active AND w.revoked_at IS NULL) AS web_ready,
        EXISTS (SELECT 1 FROM ws.web_integrations w WHERE w.account_id = b.account_id AND w.business_id = b.id AND w.active AND w.revoked_at IS NULL AND w.secret_prefix IS NOT NULL) AS has_secret
      FROM ws.businesses b WHERE b.account_id = ${accountId} ORDER BY b.created_at`,
    q`SELECT role, name, email, created_at FROM ws.members WHERE account_id = ${accountId} ORDER BY role DESC, created_at`,
    q`SELECT created_at, actor, action FROM ws.audit_log WHERE account_id = ${accountId} ORDER BY created_at DESC LIMIT 30`,
  ])
  if (!base[0] || !extra[0]) return null
  const row = mapClient(base[0])
  const billing = billingStateFrom(subscriptionRows(base[0].subscriptions))
  return {
    ...row,
    ico: (extra[0].ico as string | null) ?? null,
    newsEmails: Boolean(extra[0].news_emails),
    cancelAtPeriodEnd: billing.cancelAtPeriodEnd,
    businessesList: businesses.map((b) => ({
      id: String(b.id),
      name: String(b.name),
      slug: String(b.slug),
      industry: getIndustryTemplate(String(b.industry)).label,
      archived: Boolean(b.archived),
      webUsedAt: toDate(b.web_used_at),
      webReady: Boolean(b.web_ready),
      hasSecret: Boolean(b.has_secret),
    })),
    membersList: members.map((m) => ({
      role: m.role === 'owner' ? 'owner' : 'staff',
      name: (m.name as string | null) ?? null,
      email: (m.email as string | null) ?? null,
      createdAt: new Date(m.created_at as string),
    })),
    audit: audit.map((a) => ({
      at: new Date(a.created_at as string),
      actor: String(a.actor),
      action: String(a.action),
    })),
  }
}

/** Byznys účtu pro akce adminu (klíče webu). Cizí kombinace = null. */
export async function getClientBusiness(accountId: string, businessId: string): Promise<{ id: string; name: string; slug: string } | null> {
  if (!UUID_RE.test(accountId) || !UUID_RE.test(businessId)) return null
  const [b] = await adminDb<{ id: string; name: string; slug: string }>`
    SELECT id, name, slug FROM ws.businesses WHERE account_id = ${accountId} AND id = ${businessId} AND archived_at IS NULL`
  return b ?? null
}

/** Záznam akce adminu do auditu účtu. Nikdy bez account_id, nikdy tajemství v details. */
export async function auditAdmin(
  admin: AdminIdentity,
  entry: { accountId: string; businessId?: string | null; action: string; entity?: string | null; entityId?: string | null; details?: Record<string, unknown> },
): Promise<void> {
  await adminDb`
    INSERT INTO ws.audit_log (account_id, business_id, actor, action, entity, entity_id, details)
    VALUES (${entry.accountId}, ${entry.businessId ?? null}, ${adminActor(admin)}, ${entry.action}, ${entry.entity ?? null},
      ${entry.entityId ?? null}, ${JSON.stringify(entry.details ?? {})}::jsonb)`
}
