import 'server-only'
import { pgErrorCode, q, wsDb, type WsRow } from './db'
import type { WsBusiness, WsContext } from './context'
import { pragueParts } from './time'

// Věrnostní karty (S12, R-046). Pravidla z ws.loyalty_programs:
//   counts      visit_paid = zaplacená návštěva, job_done = dokončená zakázka,
//               amount = 1 razítko za každých amount_per_stamp Kč zaplacené návštěvy
//   service_ids jen vybrané služby (prázdné = všechny)
//   min_spend   minimální útrata (včetně, 500 Kč při minimu 500 Kč projde)
//   max_one_per_day, validity_months, auto_stamp
//
// Kolik razítek si platba zaslouží, rozhodne čistá funkce stampsForPayment.
// Stav karty (zámek, 1 denně podle dne návštěvy, platnost, plná karta,
// opakované zaplacení) hlídá v jedné transakci DB funkce
// ws.loyalty_add_stamps (migrace 077) — aplikace nic „nekontroluje a pak
// nevkládá“. Návštěva, při které se uplatní odměna, razítko nedostane.

type Biz = Pick<WsBusiness, 'id'>

export type LoyaltyCounts = 'visit_paid' | 'job_done' | 'amount'

export type LoyaltyProgram = {
  enabled: boolean
  stampsNeeded: number
  rewardText: string
  counts: LoyaltyCounts
  amountPerStamp: number | null
  serviceIds: string[]
  minSpend: number | null
  maxOnePerDay: boolean
  validityMonths: number | null
  autoStamp: boolean
}

export const DEFAULT_PROGRAM: LoyaltyProgram = {
  enabled: false,
  stampsNeeded: 5,
  rewardText: '',
  counts: 'visit_paid',
  amountPerStamp: null,
  serviceIds: [],
  minSpend: null,
  maxOnePerDay: true,
  validityMonths: null,
  autoStamp: true,
}

/** Haléře — částky se porovnávají a dělí celočíselně, ne v plovoucí čárce. */
const cents = (amount: number) => Math.round(amount * 100)

/**
 * Kolik razítek si zaslouží zaplacená návštěva (`visit`) nebo dokončená
 * zakázka (`job`). 0 = žádné. Ruční razítko a stav karty tu nejsou.
 */
export function stampsForPayment(
  program: LoyaltyProgram,
  input: { source: 'visit' | 'job'; amount: number | null; serviceId: string | null; currency?: string },
): number {
  if (!program.enabled) return 0
  const { source, amount, serviceId } = input
  // Pravidla částek jsou v Kč. Cizí měnu bez kurzu s korunami neporovnáváme.
  if (input.currency && input.currency !== 'CZK' && (program.counts === 'amount' || (program.minSpend ?? 0) > 0)) return 0
  if (program.counts === 'visit_paid' && source !== 'visit') return 0
  if (program.counts === 'job_done' && source !== 'job') return 0
  // „Každých X Kč“ počítá zaplacené návštěvy; zakázky přes faktury doplní S14.
  if (program.counts === 'amount' && source !== 'visit') return 0
  if (program.serviceIds.length > 0 && (!serviceId || !program.serviceIds.includes(serviceId))) return 0
  if (program.minSpend !== null && program.minSpend > 0) {
    if (amount === null || cents(amount) < cents(program.minSpend)) return 0
  }
  if (program.counts === 'amount') {
    if (amount === null || !program.amountPerStamp || program.amountPerStamp <= 0) return 0
    return Math.floor(cents(amount) / cents(program.amountPerStamp))
  }
  return 1
}

function rowToProgram(row: WsRow | undefined): LoyaltyProgram {
  if (!row) return DEFAULT_PROGRAM
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v))
  return {
    enabled: Boolean(row.enabled),
    stampsNeeded: Number(row.stamps_needed),
    rewardText: String(row.reward_text ?? ''),
    counts: row.counts as LoyaltyCounts,
    amountPerStamp: n(row.amount_per_stamp),
    serviceIds: ((row.service_ids as string[] | null) ?? []).map(String),
    minSpend: n(row.min_spend),
    maxOnePerDay: Boolean(row.max_one_per_day),
    validityMonths: n(row.validity_months),
    autoStamp: Boolean(row.auto_stamp),
  }
}

export async function getLoyaltyProgram(ctx: WsContext, business: Biz): Promise<LoyaltyProgram> {
  const [row] = await wsDb(ctx)`
    SELECT enabled, stamps_needed, reward_text, counts, amount_per_stamp, service_ids, min_spend, max_one_per_day, validity_months, auto_stamp
    FROM ws.loyalty_programs WHERE account_id = ${ctx.accountId} AND business_id = ${business.id}
  `
  return rowToProgram(row)
}

/** Uloží Nastavení › Věrnost a zapne/vypne funkci Věrnostní karty v menu. */
export async function saveLoyaltyProgram(ctx: WsContext, business: Biz, p: LoyaltyProgram): Promise<void> {
  const acc = ctx.accountId
  const biz = business.id
  await wsDb(ctx).batch([
    q`
      INSERT INTO ws.loyalty_programs (account_id, business_id, enabled, stamps_needed, reward_text, counts, amount_per_stamp,
        service_ids, min_spend, max_one_per_day, validity_months, auto_stamp)
      VALUES (${acc}, ${biz}, ${p.enabled}, ${p.stampsNeeded}, ${p.rewardText}, ${p.counts}, ${p.amountPerStamp},
        ${p.serviceIds}::uuid[], ${p.minSpend}, ${p.maxOnePerDay}, ${p.validityMonths}, ${p.autoStamp})
      ON CONFLICT (business_id) DO UPDATE SET
        enabled = EXCLUDED.enabled, stamps_needed = EXCLUDED.stamps_needed, reward_text = EXCLUDED.reward_text,
        counts = EXCLUDED.counts, amount_per_stamp = EXCLUDED.amount_per_stamp, service_ids = EXCLUDED.service_ids,
        min_spend = EXCLUDED.min_spend, max_one_per_day = EXCLUDED.max_one_per_day,
        validity_months = EXCLUDED.validity_months, auto_stamp = EXCLUDED.auto_stamp
      WHERE ws.loyalty_programs.account_id = ${acc}
    `,
    // Služby jen z tohoto byznysu — cizí ID z formuláře se zahodí.
    q`
      UPDATE ws.loyalty_programs p SET service_ids = COALESCE((
        SELECT array_agg(s.id) FROM ws.services s
        WHERE s.account_id = ${acc} AND s.business_id = ${biz} AND s.id = ANY(p.service_ids)
      ), '{}')
      WHERE p.account_id = ${acc} AND p.business_id = ${biz}
    `,
    q`
      INSERT INTO ws.business_modules (account_id, business_id, module, enabled)
      VALUES (${acc}, ${biz}, 'loyalty', ${p.enabled})
      ON CONFLICT (business_id, module) DO UPDATE SET enabled = EXCLUDED.enabled
      WHERE ws.business_modules.account_id = ${acc}
    `,
  ])
}

// --- Výsledek razítka --------------------------------------------------------

export type StampOutcome =
  | { result: 'added'; added: number; stamps: number; needed: number; full: boolean }
  | { result: 'duplicate' | 'same_day' | 'full' | 'off' | 'none' }

function toOutcome(raw: unknown): StampOutcome | null {
  if (!raw) return null
  const o = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Record<string, unknown>
  const result = String(o.result)
  if (result === 'added') {
    return {
      result: 'added',
      added: Number(o.added),
      stamps: Number(o.stamps),
      needed: Number(o.needed),
      full: o.status === 'full',
    }
  }
  return { result: result as 'duplicate' | 'same_day' | 'full' | 'off' | 'none' }
}

// --- Zaplacená návštěva ------------------------------------------------------

export type PaymentMethod = 'cash' | 'card' | 'transfer'

export type CompleteVisitError = 'not_found' | 'already_done' | 'cancelled' | 'block'

export type CompleteVisitResult =
  | { ok: true; data: { stamp: StampOutcome | null; redeemed: boolean; customerId: string | null } }
  | { ok: false; reason: CompleteVisitError }

/**
 * „Hotovo, zaplaceno“: termín je hotový, platba se zapíše jako příjem
 * (ws.transactions, S14 na ni naváže) a podle pravidel přibude razítko.
 * Opakované zaplacení téhož termínu nic nepřidá (UPDATE … WHERE status =
 * 'confirmed' pustí jen první, razítko navíc hlídá unikátní index).
 * `redeem` = uplatnit plnou kartu; taková návštěva razítko nedostane.
 */
export async function completeVisit(
  ctx: WsContext,
  business: Biz,
  input: { appointmentId: string; amount: number; method: PaymentMethod; redeem?: boolean; now?: Date },
): Promise<CompleteVisitResult> {
  const acc = ctx.accountId
  const biz = business.id
  const now = input.now ?? new Date()

  const [apptRows, progRows] = await wsDb(ctx).batch([
    q`
      SELECT a.id, a.kind, a.status, a.customer_id, a.service_id, a.starts_at, s.name AS service_name, COALESCE(s.currency, 'CZK') AS currency
      FROM ws.appointments a
      LEFT JOIN ws.services s ON s.account_id = a.account_id AND s.id = a.service_id
      WHERE a.account_id = ${acc} AND a.business_id = ${biz} AND a.id = ${input.appointmentId}
    `,
    q`
      SELECT enabled, stamps_needed, reward_text, counts, amount_per_stamp, service_ids, min_spend, max_one_per_day, validity_months, auto_stamp
      FROM ws.loyalty_programs WHERE account_id = ${acc} AND business_id = ${biz}
    `,
  ])
  const a = (apptRows as WsRow[])[0]
  if (!a) return { ok: false, reason: 'not_found' }
  if (a.kind !== 'visit') return { ok: false, reason: 'block' }
  if (a.status === 'completed') return { ok: false, reason: 'already_done' }
  if (a.status !== 'confirmed') return { ok: false, reason: 'cancelled' }

  const program = rowToProgram((progRows as WsRow[])[0])
  const customerId = (a.customer_id as string | null) ?? null
  const redeem = Boolean(input.redeem) && customerId !== null
  const delta =
    !redeem && customerId && program.autoStamp
      ? stampsForPayment(program, { source: 'visit', amount: input.amount, serviceId: (a.service_id as string | null) ?? null, currency: String(a.currency) })
      : 0
  const visitDay = pragueParts(a.starts_at as Date).date
  const paidOn = pragueParts(now).date
  const description = (a.service_name as string | null) ?? 'Návštěva'

  const [row] = await wsDb(ctx)`
    WITH done AS (
      UPDATE ws.appointments SET status = 'completed', completed_at = ${now}
      WHERE account_id = ${acc} AND business_id = ${biz} AND id = ${input.appointmentId} AND kind = 'visit' AND status = 'confirmed'
      RETURNING id, customer_id, job_id, service_id
    ),
    pay AS (
      INSERT INTO ws.transactions (account_id, business_id, kind, amount, currency, occurred_on, category, description,
        payment_method, customer_id, appointment_id, job_id)
      SELECT ${acc}, ${biz}, 'income', ${input.amount}::numeric,
        COALESCE((SELECT s.currency FROM ws.services s WHERE s.account_id = ${acc} AND s.id = done.service_id), 'CZK'),
        ${paidOn}::date, 'visit', ${description}, ${input.method}, done.customer_id, done.id, done.job_id
      FROM done WHERE ${input.amount}::numeric > 0
      RETURNING id
    ),
    card AS (
      UPDATE ws.loyalty_cards c SET status = 'redeemed', redeemed_at = ${now}
      FROM done
      WHERE ${redeem} AND c.account_id = ${acc} AND c.business_id = ${biz} AND c.customer_id = done.customer_id AND c.status = 'full'
      RETURNING c.id, c.stamps
    ),
    redeemed AS (
      INSERT INTO ws.loyalty_events (account_id, business_id, card_id, appointment_id, kind, delta, actor, for_day)
      SELECT ${acc}, ${biz}, card.id, ${input.appointmentId}, 'redeem', -card.stamps, ${ctx.userId}, ${visitDay}::date FROM card
      RETURNING 1
    )
    SELECT done.id,
      (SELECT count(*) FROM redeemed)::int AS redeemed,
      CASE WHEN ${delta}::int > 0 AND done.customer_id IS NOT NULL
        THEN ws.loyalty_add_stamps(${acc}, ${biz}, done.customer_id, ${delta}::int, ${visitDay}::date, done.id, NULL, 'stamp', NULL, ${ctx.userId})
      END AS stamp
    FROM done
  `
  // Někdo termín mezitím zaplatil nebo zrušil.
  if (!row) return { ok: false, reason: 'already_done' }
  return { ok: true, data: { stamp: toOutcome(row.stamp), redeemed: Number(row.redeemed) > 0, customerId } }
}

/**
 * Razítko za zakázku přesunutou do stavu „hotovo“ nebo „zaplaceno“ (jen
 * program „dokončená zakázka“). Opakovaný přesun nic nepřidá.
 */
export async function stampJob(ctx: WsContext, business: Biz, jobId: string, now: Date = new Date()): Promise<StampOutcome | null> {
  const acc = ctx.accountId
  const biz = business.id
  const [jobRows, progRows] = await wsDb(ctx).batch([
    q`
      SELECT j.customer_id, j.price, j.currency, r.service_id, st.type AS stage_type
      FROM ws.jobs j
      LEFT JOIN ws.stages st ON st.account_id = j.account_id AND st.id = j.stage_id
      LEFT JOIN ws.requests r ON r.account_id = j.account_id AND r.id = j.request_id
      WHERE j.account_id = ${acc} AND j.business_id = ${biz} AND j.id = ${jobId}
    `,
    q`
      SELECT enabled, stamps_needed, reward_text, counts, amount_per_stamp, service_ids, min_spend, max_one_per_day, validity_months, auto_stamp
      FROM ws.loyalty_programs WHERE account_id = ${acc} AND business_id = ${biz}
    `,
  ])
  const job = (jobRows as WsRow[])[0]
  if (!job?.customer_id || !['done', 'paid'].includes(String(job.stage_type))) return null
  const program = rowToProgram((progRows as WsRow[])[0])
  if (!program.autoStamp) return null
  const delta = stampsForPayment(program, {
    source: 'job',
    amount: job.price === null ? null : Number(job.price),
    serviceId: (job.service_id as string | null) ?? null,
    currency: String(job.currency),
  })
  if (delta <= 0) return null
  return addStamps(ctx, business, {
    customerId: String(job.customer_id),
    delta,
    day: pragueParts(now).date,
    jobId,
    kind: 'stamp',
  })
}

/** Ruční razítko k hotové návštěvě, když program razítkuje „ručně“ (auto_stamp vypnuté). */
export async function stampVisitManually(ctx: WsContext, business: Biz, appointmentId: string): Promise<StampOutcome | null> {
  const acc = ctx.accountId
  const biz = business.id
  const [apptRows, progRows] = await wsDb(ctx).batch([
    q`
      SELECT a.customer_id, a.service_id, a.starts_at, COALESCE(s.currency, 'CZK') AS currency,
        (SELECT sum(t.amount) FROM ws.transactions t WHERE t.account_id = a.account_id AND t.appointment_id = a.id AND t.kind = 'income' AND t.currency = COALESCE(s.currency, 'CZK')) AS paid
      FROM ws.appointments a
      LEFT JOIN ws.services s ON s.account_id = a.account_id AND s.id = a.service_id
      WHERE a.account_id = ${acc} AND a.business_id = ${biz} AND a.id = ${appointmentId} AND a.kind = 'visit' AND a.status = 'completed'
    `,
    q`
      SELECT enabled, stamps_needed, reward_text, counts, amount_per_stamp, service_ids, min_spend, max_one_per_day, validity_months, auto_stamp
      FROM ws.loyalty_programs WHERE account_id = ${acc} AND business_id = ${biz}
    `,
  ])
  const a = (apptRows as WsRow[])[0]
  if (!a?.customer_id) return null
  const program = rowToProgram((progRows as WsRow[])[0])
  const delta = stampsForPayment(program, {
    source: 'visit',
    amount: a.paid === null || a.paid === undefined ? 0 : Number(a.paid),
    serviceId: (a.service_id as string | null) ?? null,
    currency: String(a.currency),
  })
  if (delta <= 0) return { result: 'none' }
  return addStamps(ctx, business, {
    customerId: String(a.customer_id),
    delta,
    day: pragueParts(a.starts_at as Date).date,
    appointmentId,
    kind: 'stamp',
  })
}

/** Ruční přidání (+) nebo odebrání (−) razítka s důvodem (Nastavení › Věrnost, plán). */
export async function adjustStamps(
  ctx: WsContext,
  business: Biz,
  input: { customerId: string; delta: number; reason: string; now?: Date },
): Promise<StampOutcome | null> {
  return addStamps(ctx, business, {
    customerId: input.customerId,
    delta: input.delta,
    day: pragueParts(input.now ?? new Date()).date,
    kind: 'manual',
    reason: input.reason,
  })
}

async function addStamps(
  ctx: WsContext,
  business: Biz,
  input: {
    customerId: string
    delta: number
    day: string
    appointmentId?: string
    jobId?: string
    kind: 'stamp' | 'manual'
    reason?: string
  },
): Promise<StampOutcome | null> {
  const acc = ctx.accountId
  try {
    // Zákazník musí být z tohoto účtu — jinak funkce nic neudělá (NULL).
    const [row] = await wsDb(ctx)`
      SELECT ws.loyalty_add_stamps(${acc}, ${business.id}, c.id, ${input.delta}::int, ${input.day}::date,
        ${input.appointmentId ?? null}::uuid, ${input.jobId ?? null}::uuid, ${input.kind}, ${input.reason ?? null}, ${ctx.userId}) AS stamp
      FROM ws.customers c WHERE c.account_id = ${acc} AND c.id = ${input.customerId}
    `
    return row ? toOutcome(row.stamp) : null
  } catch (e) {
    // Souběžné razítko k téže návštěvě / zakázce: druhé skončí na unikátním indexu.
    if (pgErrorCode(e) === '23505') return { result: 'duplicate' }
    throw e
  }
}

/** Uplatní plnou kartu bez platby (např. odměna předaná mimo termín). Další razítko začne novou kartu. */
export async function redeemReward(ctx: WsContext, business: Biz, customerId: string, now: Date = new Date()): Promise<boolean> {
  const acc = ctx.accountId
  const biz = business.id
  const [row] = await wsDb(ctx)`
    WITH card AS (
      UPDATE ws.loyalty_cards SET status = 'redeemed', redeemed_at = ${now}
      WHERE account_id = ${acc} AND business_id = ${biz} AND customer_id = ${customerId} AND status = 'full'
      RETURNING id, stamps
    ),
    ev AS (
      INSERT INTO ws.loyalty_events (account_id, business_id, card_id, kind, delta, actor, for_day)
      SELECT ${acc}, ${biz}, card.id, 'redeem', -card.stamps, ${ctx.userId}, ${pragueParts(now).date}::date FROM card
      RETURNING 1
    )
    SELECT count(*)::int AS n FROM ev
  `
  return Number(row?.n ?? 0) > 0
}

/**
 * Denní úklid (cron): rozpracované karty po platnosti propadnou, aby karta
 * zákazníka neukazovala razítka, která už neplatí.
 */
export async function expireCards(ctx: Pick<WsContext, 'accountId'>, business: Biz): Promise<number> {
  const acc = ctx.accountId
  const biz = business.id
  const [row] = await wsDb(ctx)`
    WITH old AS (
      UPDATE ws.loyalty_cards c SET status = 'expired'
      FROM ws.loyalty_programs p
      WHERE c.account_id = ${acc} AND c.business_id = ${biz} AND c.status = 'active'
        AND p.account_id = c.account_id AND p.id = c.program_id AND p.validity_months IS NOT NULL
        AND c.created_at + make_interval(months => p.validity_months) < now()
      RETURNING c.id, c.stamps
    ),
    ev AS (
      INSERT INTO ws.loyalty_events (account_id, business_id, card_id, kind, delta, reason, actor)
      SELECT ${acc}, ${biz}, old.id, 'expire', -old.stamps, 'Vypršela platnost karty', 'system' FROM old WHERE old.stamps > 0
      RETURNING 1
    )
    SELECT count(*)::int AS n FROM old
  `
  return Number(row?.n ?? 0)
}

// --- Čtení pro detail termínu a zákazníka ------------------------------------

export type VisitPayment = {
  status: string
  servicePrice: number | null
  currency: string
  paid: { amount: number; method: string | null } | null
  stamped: boolean
  program: { enabled: boolean; autoStamp: boolean; rewardText: string }
  /** Zákazník má plnou kartu — při zaplacení se nabídne uplatnění. */
  rewardReady: boolean
}

export async function getVisitPayment(ctx: WsContext, business: Biz, appointmentId: string): Promise<VisitPayment | null> {
  const acc = ctx.accountId
  const biz = business.id
  const [rows, progRows] = await wsDb(ctx).batch([
    q`
      SELECT a.status, s.price, COALESCE(s.currency, 'CZK') AS currency,
        (SELECT sum(t.amount) FROM ws.transactions t WHERE t.account_id = a.account_id AND t.appointment_id = a.id AND t.kind = 'income' AND t.currency = COALESCE(s.currency, 'CZK')) AS paid,
        (SELECT t.payment_method FROM ws.transactions t WHERE t.account_id = a.account_id AND t.appointment_id = a.id AND t.kind = 'income' AND t.currency = COALESCE(s.currency, 'CZK')
          ORDER BY t.created_at LIMIT 1) AS method,
        EXISTS (SELECT 1 FROM ws.loyalty_events e WHERE e.account_id = a.account_id AND e.appointment_id = a.id AND e.kind IN ('stamp', 'redeem')) AS stamped,
        EXISTS (SELECT 1 FROM ws.loyalty_cards c WHERE c.account_id = a.account_id AND c.business_id = a.business_id
          AND c.customer_id = a.customer_id AND c.status = 'full') AS reward_ready
      FROM ws.appointments a
      LEFT JOIN ws.services s ON s.account_id = a.account_id AND s.id = a.service_id
      WHERE a.account_id = ${acc} AND a.business_id = ${biz} AND a.id = ${appointmentId} AND a.kind = 'visit'
    `,
    q`SELECT enabled, auto_stamp, reward_text FROM ws.loyalty_programs WHERE account_id = ${acc} AND business_id = ${biz}`,
  ])
  const r = (rows as WsRow[])[0]
  if (!r) return null
  const p = (progRows as WsRow[])[0]
  const enabled = Boolean(p?.enabled)
  return {
    status: String(r.status),
    servicePrice: r.price === null || r.price === undefined ? null : Number(r.price),
    currency: String(r.currency),
    paid: r.paid === null || r.paid === undefined ? null : { amount: Number(r.paid), method: (r.method as string | null) ?? null },
    stamped: Boolean(r.stamped),
    program: { enabled, autoStamp: Boolean(p?.auto_stamp ?? true), rewardText: String(p?.reward_text ?? '') },
    rewardReady: enabled && Boolean(r.reward_ready),
  }
}

export type LoyaltyEvent = { id: string; kind: string; delta: number; reason: string | null; created_at: Date }

/** Posledních 20 pohybů na kartách zákazníka v byznysu (detail zákazníka). */
export async function getLoyaltyEvents(ctx: WsContext, business: Biz, customerId: string): Promise<LoyaltyEvent[]> {
  const rows = await wsDb(ctx)`
    SELECT e.id, e.kind, e.delta, e.reason, e.created_at
    FROM ws.loyalty_events e
    JOIN ws.loyalty_cards c ON c.account_id = e.account_id AND c.id = e.card_id
    WHERE e.account_id = ${ctx.accountId} AND e.business_id = ${business.id} AND c.customer_id = ${customerId}
    ORDER BY e.created_at DESC
    LIMIT 20
  `
  return rows.map((r) => ({
    id: String(r.id),
    kind: String(r.kind),
    delta: Number(r.delta),
    reason: (r.reason as string | null) ?? null,
    created_at: r.created_at as Date,
  }))
}
