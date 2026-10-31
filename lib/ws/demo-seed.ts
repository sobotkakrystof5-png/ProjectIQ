// Ukázková data pro obrazovku Dnes (S09): fiktivní zákazníci, poptávky
// a termíny kolem dneška, aby šlo kostru aplikace vyzkoušet bez webu.
//
// Spouští se skriptem `node scripts/ws-seed.mjs <slug> --ano` (Node 24 umí
// .ts sám). Proto tenhle soubor nemá žádný runtime import — jen typy — a časy
// počítá Postgres (pražský čas přes AT TIME ZONE).
//
// Všechno je jasně označené a jde smazat: zákazníci mají poznámku DEMO_MARK,
// poptávky external_id 'ws-seed-*', termíny poznámku DEMO_MARK, pracovnice
// jméno DEMO_STAFF. Seed nejdřív smaže předchozí ukázková data, takže jde
// pustit opakovaně. Skutečných dat se nedotkne.

import type { WsQuery } from './db'

export const DEMO_MARK = '[ukázková data]'
export const DEMO_STAFF = 'Ukázková pracovnice'
export const DEMO_REWARD = 'Ukázková odměna'

export type DemoScope = { accountId: string; businessId: string; slug: string; today: string }

// Vlastní mini `q` (stejný tvar jako q z ./db) — runtime import tu nesmí být.
function q(strings: TemplateStringsArray, ...values: unknown[]): WsQuery {
  let text = strings[0]
  for (let i = 0; i < values.length; i++) text += `$${i + 1}${strings[i + 1]}`
  return { text, params: values }
}

const CUSTOMERS = [
  { key: 'tereza', name: 'Tereza Testová', phone: '+420000000101', email: 'tereza.testova@example.cz', segment: 'new' },
  { key: 'jana', name: 'Jana Ukázková', phone: '+420000000102', email: 'jana.ukazkova@example.cz', segment: 'regular' },
  { key: 'petr', name: 'Petr Zkušební', phone: '+420000000103', email: null, segment: 'new' },
  { key: 'marie', name: 'Marie Vzorová', phone: '+420000000104', email: 'marie.vzorova@example.cz', segment: 'regular' },
  { key: 'karel', name: 'Karel Pokusný', phone: '+420000000105', email: 'karel.pokusny@example.cz', segment: 'dormant' },
  { key: 'eva', name: 'Eva Demo', phone: '+420000000106', email: 'eva.demo@example.cz', segment: 'new' },
] as const

type CustomerKey = (typeof CUSTOMERS)[number]['key']
const phoneOf = (key: CustomerKey) => CUSTOMERS.find((c) => c.key === key)!.phone

/** Smaže jen ukázková data (pořadí kvůli cizím klíčům). */
export function demoCleanupQueries({ accountId, businessId }: Omit<DemoScope, 'today' | 'slug'>): WsQuery[] {
  return [
    q`DELETE FROM ws.notifications WHERE account_id = ${accountId} AND business_id = ${businessId} AND type = 'demo'`,
    q`DELETE FROM ws.transactions WHERE account_id = ${accountId} AND business_id = ${businessId} AND description = ${DEMO_MARK}`,
    q`
      DELETE FROM ws.outbound_messages m WHERE m.account_id = ${accountId} AND m.status = 'draft'
        AND m.customer_id IN (SELECT id FROM ws.customers WHERE account_id = ${accountId} AND note = ${DEMO_MARK})
    `,
    q`DELETE FROM ws.appointments WHERE account_id = ${accountId} AND business_id = ${businessId} AND note = ${DEMO_MARK}`,
    q`DELETE FROM ws.requests WHERE account_id = ${accountId} AND business_id = ${businessId} AND external_id LIKE 'ws-seed-%'`,
    q`DELETE FROM ws.customers WHERE account_id = ${accountId} AND note = ${DEMO_MARK}`,
    q`
      DELETE FROM ws.staff s WHERE s.account_id = ${accountId} AND s.business_id = ${businessId} AND s.name = ${DEMO_STAFF}
        AND NOT EXISTS (SELECT 1 FROM ws.appointments a WHERE a.account_id = s.account_id AND a.staff_id = s.id)
    `,
    // Funkce Věrnost se vypne spolu s ukázkovým programem (před ním, dokud nese ukázkovou odměnu).
    q`
      UPDATE ws.business_modules m SET enabled = false
      WHERE m.account_id = ${accountId} AND m.business_id = ${businessId} AND m.module = 'loyalty'
        AND EXISTS (SELECT 1 FROM ws.loyalty_programs p WHERE p.account_id = m.account_id AND p.business_id = m.business_id AND p.reward_text = ${DEMO_REWARD})
    `,
    q`
      UPDATE ws.loyalty_programs SET enabled = false, reward_text = ''
      WHERE account_id = ${accountId} AND business_id = ${businessId} AND reward_text = ${DEMO_REWARD}
    `,
  ]
}

/** Smaže předchozí ukázková data a vloží nová. Vše v jedné transakci. */
export function demoSeedQueries(scope: DemoScope): WsQuery[] {
  const { accountId, businessId, slug, today } = scope
  const queries: WsQuery[] = [...demoCleanupQueries(scope)]

  const at = (day: number, minutes: number) => q`
    ((${today}::date + ${day}::int) + make_interval(mins => ${minutes}::int))::timestamp AT TIME ZONE 'Europe/Prague'`
  const customerId = (key: CustomerKey) =>
    q`(SELECT id FROM ws.customers WHERE account_id = ${accountId} AND phone = ${phoneOf(key)})`
  const serviceId = (index: number) => q`
    (SELECT id FROM ws.services WHERE account_id = ${accountId} AND business_id = ${businessId}
     ORDER BY position, name LIMIT 1 OFFSET ${index}::int)`
  const staffId = q`
    (SELECT id FROM ws.staff WHERE account_id = ${accountId} AND business_id = ${businessId} AND name = ${DEMO_STAFF} LIMIT 1)`

  // Složí několik q-fragmentů do jednoho dotazu (přečísluje $n).
  const join = (parts: (string | WsQuery)[]): WsQuery => {
    let text = ''
    const params: unknown[] = []
    for (const part of parts) {
      if (typeof part === 'string') {
        text += part
        continue
      }
      text += part.text.replace(/\$(\d+)/g, (_, n: string) => `$${Number(n) + params.length}`)
      params.push(...part.params)
    }
    return { text, params }
  }

  // Souhlas s kontaktem a narozeniny pro panel „Komu napsat“ (S12).
  const CONSENT: CustomerKey[] = ['jana', 'karel', 'tereza']
  for (const c of CUSTOMERS) {
    queries.push(q`
      INSERT INTO ws.customers (account_id, name, phone, email, note, contact_consent_at, birthday)
      VALUES (${accountId}, ${c.name}, ${c.phone}, ${c.email}, ${DEMO_MARK},
        CASE WHEN ${CONSENT.includes(c.key)} THEN now() END,
        CASE WHEN ${c.key === 'tereza'} THEN ${today}::date + 3 - interval '30 years' END)
    `)
  }

  queries.push(q`INSERT INTO ws.staff (account_id, business_id, name) VALUES (${accountId}, ${businessId}, ${DEMO_STAFF})`)

  // Termíny: [zákazník, den od dneška, začátek v minutách, délka, služba, stav]
  // Historie odpovídá skupinám v CUSTOMERS (ověřuje ws-segments.test.ts):
  // Jana a Marie chodí pravidelně (Stálé), Karel chodil po 50 dnech a půl roku
  // nepřišel (Spící), ostatní zatím nepřišli (Noví).
  const visits: [CustomerKey, number, number, number, number, 'confirmed' | 'completed'][] = [
    ['jana', -70, 9 * 60, 60, 0, 'completed'],
    ['jana', -42, 9 * 60, 60, 0, 'completed'],
    ['jana', -14, 10 * 60, 60, 0, 'completed'],
    ['marie', -95, 14 * 60, 120, 2, 'completed'],
    ['marie', -60, 14 * 60, 120, 2, 'completed'],
    ['marie', -30, 14 * 60, 120, 2, 'completed'],
    ['karel', -330, 16 * 60, 30, 1, 'completed'],
    ['karel', -280, 16 * 60, 30, 1, 'completed'],
    ['karel', -230, 16 * 60, 30, 1, 'completed'],
    ['karel', -180, 16 * 60, 30, 1, 'completed'],
    ['jana', 0, 9 * 60, 60, 0, 'confirmed'],
    ['marie', 0, 13 * 60, 120, 2, 'confirmed'],
    ['karel', 0, 15 * 60 + 30, 30, 1, 'confirmed'],
    ['tereza', 1, 11 * 60, 60, 3, 'confirmed'],
    ['jana', 3, 10 * 60, 60, 0, 'confirmed'],
  ]
  for (const [who, day, start, length, service, status] of visits) {
    queries.push(
      join([
        `INSERT INTO ws.appointments (account_id, business_id, kind, staff_id, customer_id, service_id, starts_at, ends_at, status, note) VALUES (`,
        q`${accountId}, ${businessId}, 'visit', `,
        staffId,
        ', ',
        customerId(who),
        ', ',
        serviceId(service),
        ', ',
        at(day, start),
        ', ',
        at(day, start + length),
        q`, ${status}, ${DEMO_MARK})`,
      ]),
    )
  }
  // Platby za proběhlé návštěvy (útrata v Zákaznících). Částka je ukázková.
  queries.push(q`
    INSERT INTO ws.transactions (account_id, business_id, kind, amount, occurred_on, category, description, payment_method, customer_id, appointment_id)
    SELECT account_id, business_id, 'income', 600, (starts_at AT TIME ZONE 'Europe/Prague')::date, 'visit', ${DEMO_MARK}, 'cash', customer_id, id
    FROM ws.appointments
    WHERE account_id = ${accountId} AND business_id = ${businessId} AND note = ${DEMO_MARK} AND status = 'completed'
  `)

  // Blokace (oběd) — bez pracovníka, kolize ji nehlídá.
  queries.push(
    join([
      `INSERT INTO ws.appointments (account_id, business_id, kind, title, starts_at, ends_at, note) VALUES (`,
      q`${accountId}, ${businessId}, 'block', 'Oběd', `,
      at(0, 12 * 60),
      ', ',
      at(0, 12 * 60 + 30),
      q`, ${DEMO_MARK})`,
    ]),
  )

  // Nové poptávky: [n, zákazník, den, začátek (null = bez termínu), služba, před kolika minutami přišla, zpráva]
  const requests: [number, CustomerKey, number, number | null, number, number, string | null][] = [
    [1, 'tereza', 2, 10 * 60, 0, 8, null],
    [2, 'petr', 4, 14 * 60, 1, 95, 'Šlo by to i odpoledne?'],
    [3, 'eva', 0, null, 3, 300, 'Ozvěte se prosím, kdy máte volno.'],
  ]
  for (const [n, who, day, start, service, ago, message] of requests) {
    const c = CUSTOMERS.find((x) => x.key === who)!
    const contact = JSON.stringify({ name: c.name, phone: c.phone, email: c.email ?? undefined })
    queries.push(
      join([
        `INSERT INTO ws.requests (account_id, business_id, customer_id, service_id, wanted_start, contact, message, source, external_id, created_at) VALUES (`,
        q`${accountId}, ${businessId}, `,
        customerId(who),
        ', ',
        serviceId(service),
        ', ',
        start === null ? 'NULL' : at(day, start),
        q`, ${contact}::jsonb, ${message}, 'web', ${`ws-seed-${n}`}, now() - make_interval(mins => ${ago}::int))`,
      ]),
    )
  }
  // Starší vyřízená poptávka (do Příchozích nepatří)
  queries.push(
    join([
      `INSERT INTO ws.requests (account_id, business_id, customer_id, status, source, external_id, handled_at, created_at) VALUES (`,
      q`${accountId}, ${businessId}, `,
      customerId('marie'),
      q`, 'confirmed', 'web', 'ws-seed-0', now() - interval '3 days', now() - interval '3 days')`,
    ]),
  )

  for (const c of CUSTOMERS) {
    queries.push(
      join([
        `INSERT INTO ws.customer_segments (account_id, business_id, customer_id, segment) VALUES (`,
        q`${accountId}, ${businessId}, `,
        customerId(c.key),
        q`, ${c.segment}) ON CONFLICT (business_id, customer_id) DO UPDATE SET segment = EXCLUDED.segment`,
      ]),
    )
  }

  // Věrnost: zapnout jen tam, kde vypnutá a bez vlastní odměny (cleanup ji zase vypne).
  queries.push(q`
    UPDATE ws.loyalty_programs SET enabled = true, reward_text = ${DEMO_REWARD}
    WHERE account_id = ${accountId} AND business_id = ${businessId} AND NOT enabled AND reward_text = ''
  `)
  // Program i funkce musí říkat totéž (lib/ws/settings.ts → setModule).
  queries.push(q`
    INSERT INTO ws.business_modules (account_id, business_id, module, enabled)
    SELECT p.account_id, p.business_id, 'loyalty', true FROM ws.loyalty_programs p
    WHERE p.account_id = ${accountId} AND p.business_id = ${businessId} AND p.reward_text = ${DEMO_REWARD}
    ON CONFLICT (business_id, module) DO UPDATE SET enabled = true
  `)
  const cards: [CustomerKey, 'some' | 'full'][] = [
    ['jana', 'some'],
    ['marie', 'full'],
  ]
  for (const [who, fill] of cards) {
    queries.push(
      join([
        `INSERT INTO ws.loyalty_cards (account_id, business_id, program_id, customer_id, stamps, status) SELECT `,
        q`${accountId}, ${businessId}, p.id, `,
        customerId(who),
        fill === 'full'
          ? `, p.stamps_needed, 'full'`
          : `, GREATEST(p.stamps_needed - 1, 0), 'active'`,
        q` FROM ws.loyalty_programs p WHERE p.account_id = ${accountId} AND p.business_id = ${businessId}`,
      ]),
    )
  }

  queries.push(
    join([
      `INSERT INTO ws.notifications (account_id, business_id, type, title, body, link) VALUES (`,
      q`${accountId}, ${businessId}, 'demo', 'Nová poptávka', 'Tereza Testová chce termín.', `,
      q`'/w/' || ${slug}::text || '?detail=poptavka:' || `,
      q`(SELECT id::text FROM ws.requests WHERE account_id = ${accountId} AND external_id = 'ws-seed-1'))`,
    ]),
  )

  return queries
}
