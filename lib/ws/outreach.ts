import 'server-only'
import { q, wsDb, type WsRow } from './db'
import type { WsBusiness, WsContext } from './context'
import { nextBirthday } from './customers'
import { MESSAGE_TOPICS, type MessageTopic } from './detail-param'
import { daysBetween, formatDayShort, formatMinutes, pragueParts } from './time'

// Panel „Komu napsat“ (S12, plán: Segmenty zákazníků). Návrhy jen pro
// zákazníky se souhlasem s kontaktem, bez odhlášení, neukončené a s
// e-mailem — SMS čeká na rozhodnutí o poskytovateli (Otevřené problémy).
// „Připravit zprávu“ uloží koncept do ws.outbound_messages (status 'draft');
// odeslání přes frontu doplní S15.

// Druhy návrhů sdílí s pravým panelem (`?detail=zprava:<id>:<druh>`).
export const OUTREACH_KINDS = MESSAGE_TOPICS
export type OutreachKind = MessageTopic

export type OutreachSuggestion = {
  customerId: string
  name: string
  kind: OutreachKind
  /** Proč právě teď, krátce pro řádek v panelu. */
  reason: string
}

/** Jak dlouho se tentýž návrh neopakuje, když už pro něj vznikla zpráva. */
const QUIET_DAYS = 30
const BIRTHDAY_AHEAD = 7
const THANKS_FROM = 1
const THANKS_TO = 14
const LIMIT = 12

/** Podmínka „smí se oslovit“ nad aliasem `c` — stejná pro návrhy i uložení konceptu. */
const CONTACTABLE = `c.contact_consent_at IS NOT NULL AND c.unsubscribed_at IS NULL AND c.ended_at IS NULL AND c.email IS NOT NULL`

export async function getOutreachSuggestions(ctx: WsContext, business: Pick<WsBusiness, 'id'>, now: Date = new Date()): Promise<OutreachSuggestion[]> {
  const acc = ctx.accountId
  const biz = business.id
  const today = pragueParts(now).date
  const [rows, recent] = await wsDb(ctx).batch([
    {
      text: `
        SELECT c.id, c.name, c.birthday::text AS birthday, cs.segment, cs.visits_12m, cs.last_visit_at,
          lc.stamps, p.stamps_needed, p.reward_text,
          EXISTS (SELECT 1 FROM ws.appointments a WHERE a.account_id = c.account_id AND a.business_id = $2 AND a.customer_id = c.id
            AND a.kind = 'visit' AND a.status = 'confirmed' AND a.starts_at > $3) AS booked
        FROM ws.customers c
        LEFT JOIN ws.customer_segments cs ON cs.account_id = c.account_id AND cs.business_id = $2 AND cs.customer_id = c.id
        LEFT JOIN ws.loyalty_programs p ON p.account_id = c.account_id AND p.business_id = $2 AND p.enabled
        LEFT JOIN ws.loyalty_cards lc ON lc.account_id = c.account_id AND lc.program_id = p.id AND lc.customer_id = c.id AND lc.status = 'active'
        WHERE c.account_id = $1 AND ${CONTACTABLE}
          AND (cs.segment IS NOT NULL OR lc.id IS NOT NULL
            OR EXISTS (SELECT 1 FROM ws.requests r WHERE r.account_id = c.account_id AND r.business_id = $2 AND r.customer_id = c.id AND NOT r.is_test)
            OR EXISTS (SELECT 1 FROM ws.appointments a WHERE a.account_id = c.account_id AND a.business_id = $2 AND a.customer_id = c.id))
          AND (cs.segment IN ('dormant', 'new') OR c.birthday IS NOT NULL OR lc.stamps = p.stamps_needed - 1)
        ORDER BY c.name
        LIMIT 500
      `,
      params: [acc, biz, now],
    },
    q`
      SELECT DISTINCT customer_id, type FROM ws.outbound_messages
      WHERE account_id = ${acc} AND business_id = ${biz} AND type LIKE 'outreach_%' AND status <> 'cancelled'
        AND created_at > ${now}::timestamptz - make_interval(days => ${QUIET_DAYS})
    `,
  ])
  const done = new Set((recent as WsRow[]).map((r) => `${r.customer_id}:${r.type}`))
  const out: OutreachSuggestion[] = []

  for (const r of rows as WsRow[]) {
    const id = String(r.id)
    const fresh = (kind: OutreachKind) => !done.has(`${id}:outreach_${kind}`)
    const pick = (kind: OutreachKind, reason: string) => out.push({ customerId: id, name: String(r.name), kind, reason })

    if (r.birthday && fresh('birthday')) {
      const b = nextBirthday(String(r.birthday), today)
      if (b.inDays <= BIRTHDAY_AHEAD) {
        pick('birthday', b.inDays === 0 ? 'Narozeniny má dnes' : `Narozeniny ${formatDayShort(b.date)}`)
        continue
      }
    }
    const needed = Number(r.stamps_needed ?? 0)
    if (needed >= 2 && r.stamps !== null && Number(r.stamps) === needed - 1 && fresh('almost')) {
      pick('almost', `Karta ${needed - 1}/${needed}, příště odměna`)
      continue
    }
    if (r.segment === 'dormant' && !r.booked && fresh('winback')) {
      const last = r.last_visit_at ? pragueParts(r.last_visit_at as Date).date : null
      pick('winback', last ? `Spí, naposledy ${formatDayShort(last)}` : 'Spí')
      continue
    }
    if (r.segment === 'new' && r.last_visit_at && !r.booked && fresh('thanks')) {
      const since = daysBetween(pragueParts(r.last_visit_at as Date).date, today)
      if (since >= THANKS_FROM && since <= THANKS_TO) pick('thanks', 'Po první návštěvě')
    }
  }

  const order: Record<OutreachKind, number> = { birthday: 0, almost: 1, winback: 2, thanks: 3 }
  return out.sort((a, b) => order[a.kind] - order[b.kind] || a.name.localeCompare(b.name, 'cs')).slice(0, LIMIT)
}

// --- Text zprávy ----------------------------------------------------------------

export type DraftInput = {
  businessName: string
  reward: string | null
  orderUrl: string
  /** Volné časy pro Spící (nejbližší, každý jiný den). */
  slots: Date[]
}

/**
 * Návrh e-mailu (uživatel ho před uložením upraví). Bez oslovení jménem —
 * pátý pád se z jména spolehlivě nesloží; bez slibů slev, které firma nedala.
 */
export function draftMessage(kind: OutreachKind, input: DraftInput): { subject: string; body: string } {
  const sign = `\n\n${input.businessName}`
  const order = `Objednat se můžete tady: ${input.orderUrl}`
  switch (kind) {
    case 'winback': {
      const times = input.slots
        .map((d) => {
          const p = pragueParts(d)
          return `${formatDayShort(p.date)} v ${formatMinutes(p.minutes)}`
        })
        .join(', ')
      return {
        subject: 'Dlouho jsme se neviděli',
        body: `Dobrý den,\n\ndlouho jsme se neviděli a rádi vás zase uvidíme.${times ? `\nVolné termíny máme třeba ${times}.` : ''}\n${order}${sign}`,
      }
    }
    case 'almost':
      return {
        subject: 'Do odměny vám chybí jedno razítko',
        body: `Dobrý den,\n\nna věrnostní kartě vám chybí už jen jedno razítko.${input.reward ? ` Příště vás čeká: ${input.reward}.` : ''}\n${order}${sign}`,
      }
    case 'birthday':
      return {
        subject: 'Všechno nejlepší k narozeninám',
        body: `Dobrý den,\n\npřejeme vám všechno nejlepší k narozeninám.${sign}`,
      }
    case 'thanks':
      return {
        subject: 'Děkujeme za návštěvu',
        body: `Dobrý den,\n\nděkujeme, že jste k nám zašli. Až budete chtít přijít znovu, ${order.charAt(0).toLowerCase()}${order.slice(1)}${sign}`,
      }
  }
}

/** Nejbližší volné časy, každý jiný den (pro návrh zprávy Spícím). */
export function pickSlotSuggestions(days: { date: string; times: number[] }[], count = 3, toUtc: (day: string, minutes: number) => Date): Date[] {
  const out: Date[] = []
  for (const d of days) {
    if (out.length >= count) break
    if (d.times.length > 0) out.push(toUtc(d.date, d.times[0]))
  }
  return out
}

// --- Koncepty -----------------------------------------------------------------

export type DraftContact = { customerId: string; name: string; email: string }

/** Zákazník, kterému smí jít zpráva (jinak null — „Komu napsat“ ho nenabídne). */
export async function getContactableCustomer(ctx: WsContext, customerId: string): Promise<DraftContact | null> {
  const [row] = await wsDb(ctx).batch([
    {
      text: `SELECT c.id, c.name, c.email FROM ws.customers c WHERE c.account_id = $1 AND c.id = $2 AND ${CONTACTABLE}`,
      params: [ctx.accountId, customerId],
    },
  ])
  const r = (row as WsRow[])[0]
  return r ? { customerId: String(r.id), name: String(r.name), email: String(r.email) } : null
}

/**
 * Uloží koncept e-mailu. Souhlas se ověří znovu v tomtéž příkazu — bez něj
 * se nic neuloží (vrací false).
 */
export async function saveDraft(
  ctx: WsContext,
  business: Pick<WsBusiness, 'id'>,
  input: { customerId: string; kind: OutreachKind; subject: string; body: string },
): Promise<boolean> {
  const [rows] = await wsDb(ctx).batch([
    {
      text: `
        INSERT INTO ws.outbound_messages (account_id, business_id, customer_id, channel, type, to_address, subject, payload, status)
        SELECT $1, $2, c.id, 'email', $3, c.email, $4, jsonb_build_object('body', $5::text), 'draft'
        FROM ws.customers c
        WHERE c.account_id = $1 AND c.id = $6 AND ${CONTACTABLE}
        RETURNING id
      `,
      params: [ctx.accountId, business.id, `outreach_${input.kind}`, input.subject, input.body, input.customerId],
    },
  ])
  return (rows as WsRow[]).length > 0
}

export type DraftItem = { id: string; customerId: string | null; name: string; subject: string; createdAt: Date }

export async function getDrafts(ctx: WsContext, business: Pick<WsBusiness, 'id'>): Promise<DraftItem[]> {
  const rows = await wsDb(ctx)`
    SELECT m.id, m.customer_id, COALESCE(c.name, m.to_address) AS name, COALESCE(m.subject, '') AS subject, m.created_at
    FROM ws.outbound_messages m
    LEFT JOIN ws.customers c ON c.account_id = m.account_id AND c.id = m.customer_id
    WHERE m.account_id = ${ctx.accountId} AND m.business_id = ${business.id} AND m.status = 'draft'
    ORDER BY m.created_at DESC LIMIT 20
  `
  return rows.map((r) => ({
    id: String(r.id),
    customerId: (r.customer_id as string | null) ?? null,
    name: String(r.name),
    subject: String(r.subject),
    createdAt: r.created_at as Date,
  }))
}

/** Zahodit koncept (a „Zpět“ = vrátit). Jen koncepty, odeslané zprávy se nemění. */
export async function setDraftDiscarded(ctx: WsContext, business: Pick<WsBusiness, 'id'>, id: string, discarded: boolean): Promise<boolean> {
  const rows = await wsDb(ctx)`
    UPDATE ws.outbound_messages SET status = CASE WHEN ${discarded} THEN 'cancelled' ELSE 'draft' END
    WHERE account_id = ${ctx.accountId} AND business_id = ${business.id} AND id = ${id} AND type LIKE 'outreach_%'
      AND status = CASE WHEN ${discarded} THEN 'draft' ELSE 'cancelled' END
    RETURNING id
  `
  return rows.length > 0
}
