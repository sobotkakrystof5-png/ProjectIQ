import 'server-only'
import { q, wsDb, wsSystem, type WsRow } from '../db'
import type { WsContext } from '../context'
import { estimateTax, RATES } from '../money/calculations'
import { getTaxSettings } from '../money/data'
import { getOutreachSuggestions } from '../outreach'
import { SEGMENT_LABELS, type SegmentKey } from '../segment-labels'
import { addDays, formatDayShort, formatMinutes, pragueParts, pragueToUtc, weekdayOf } from '../time'
import type { EmailBlock } from './layout'
import { emailOrigin, signLink, unsubscribeUrl } from './links'
import { formatWhen, isOn, loadSender, ownerEmail, visitPortalButton, type Sender } from './notify'
import { enqueueEmail, flushAll } from './queue'
import { composeCustomerEmail } from './compose'
import { renderEmail } from './layout'

// Denní e-maily Workspace (S15, cron /api/cron/ws-email ráno, R-006: jen 1× denně):
//   - připomínky termínů na zítřek (zákazníkům, funkce Připomínky),
//   - faktury po splatnosti a blížící se limit DPH (majiteli + zvonek),
//   - ranní přehled (Po–Pá), týdenní (pondělí), měsíční (1. den),
//   - novinky ZakazIQ (všem účtům, které je nevypnuly),
//   - nakonec odeslání celé fronty.
// Každá zpráva má klíč události, takže opakovaný běh cronu nic nezdvojí.

type Scope = { accountId: string }

const money = (amount: number, currency: string) =>
  new Intl.NumberFormat('cs-CZ', { style: 'currency', currency, maximumFractionDigits: amount % 1 === 0 ? 0 : 2 }).format(amount)

const MONTHS = ['leden', 'únor', 'březen', 'duben', 'květen', 'červen', 'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec']

const appLink = (slug: string, path = '') => `${emailOrigin()}/w/${slug}${path}`

/** Upozornění do zvonku, jen jednou na odkaz a typ. */
async function bell(scope: Scope, businessId: string | null, type: string, title: string, body: string | null, link: string | null): Promise<void> {
  await wsDb(scope)`
    INSERT INTO ws.notifications (account_id, business_id, type, title, body, link)
    SELECT ${scope.accountId}, ${businessId}, ${type}, ${title.slice(0, 200)}, ${body}, ${link}
    WHERE NOT EXISTS (SELECT 1 FROM ws.notifications WHERE account_id = ${scope.accountId} AND type = ${type} AND link IS NOT DISTINCT FROM ${link})`
}

// --- Připomínky ------------------------------------------------------------------

export async function queueReminders(scope: Scope, sender: Sender, today: string): Promise<number> {
  if (!sender.customerMail || !isOn(sender, 'reminder')) return 0
  const tomorrow = addDays(today, 1)
  const rows = await wsDb(scope)`
    SELECT a.id, a.public_token, a.starts_at, a.customer_id, c.name, c.email, s.name AS service
    FROM ws.appointments a
    JOIN ws.customers c ON c.account_id = a.account_id AND c.id = a.customer_id
    LEFT JOIN ws.services s ON s.account_id = a.account_id AND s.id = a.service_id
    WHERE a.account_id = ${scope.accountId} AND a.business_id = ${sender.business.id}
      AND a.kind = 'visit' AND a.status = 'confirmed' AND c.email IS NOT NULL
      AND a.starts_at >= ${pragueToUtc(tomorrow, 0)} AND a.starts_at < ${pragueToUtc(addDays(tomorrow, 1), 0)}`
  const s = sender.settings.get('reminder')
  let n = 0
  for (const a of rows) {
    const start = new Date(a.starts_at as string)
    const email = composeCustomerEmail({
      type: 'reminder',
      brand: sender.business,
      subject: s?.subject,
      body: s?.body,
      values: { jmeno: String(a.name ?? ''), termin: formatWhen(start), sluzba: String(a.service ?? '') },
      extras: {
        calendarUrl: `${emailOrigin()}/z/kalendar/${signLink({ kind: 'c', accountId: scope.accountId, id: String(a.id) })}`,
        portal: visitPortalButton(sender, a.public_token as string | null),
      },
    })
    const id = await enqueueEmail(scope, {
      businessId: sender.business.id,
      customerId: String(a.customer_id),
      type: 'reminder',
      to: String(a.email),
      replyTo: sender.replyTo,
      fromName: sender.business.name,
      email,
      dedupeKey: `reminder:${String(a.id)}`,
      validUntil: start,
    })
    if (id) n++
  }
  return n
}

// --- Faktury po splatnosti a DPH ---------------------------------------------------

async function queueOverdue(scope: Scope, sender: Sender, today: string): Promise<void> {
  if (!isOn(sender, 'invoice_overdue')) return
  const rows = await wsDb(scope)`
    SELECT id, number, amount, currency, due_on::text AS due, counterparty->>'name' AS who FROM ws.invoices
    WHERE account_id = ${scope.accountId} AND business_id = ${sender.business.id}
      AND direction = 'issued' AND status = 'issued' AND due_on < ${today}::date AND due_on >= ${addDays(today, -30)}::date`
  for (const i of rows) {
    const number = String(i.number)
    const amount = money(Number(i.amount), String(i.currency))
    const link = `/w/${sender.business.slug}/faktury`
    await ownerEmail(
      scope,
      sender,
      'invoice_overdue',
      {
        subject: `Faktura ${number} je po splatnosti`,
        body: 'Tahle faktura ještě není zaplacená a splatnost už minula. Když platba dorazila, označte ji v aplikaci jako zaplacenou.',
        blocks: [
          {
            kind: 'details',
            rows: [
              { label: 'Faktura', value: number, mono: true },
              { label: 'Odběratel', value: String(i.who ?? '') },
              { label: 'Částka', value: amount, mono: true },
              { label: 'Splatnost', value: formatDayShort(String(i.due)), mono: true },
            ],
          },
          { kind: 'buttons', items: [{ label: 'Otevřít faktury', url: appLink(sender.business.slug, '/faktury') }] },
        ],
      },
      { dedupeKey: `overdue:${String(i.id)}` },
    )
    await bell(scope, sender.business.id, 'invoice_overdue', `Faktura ${number} je po splatnosti`, `${amount} · ${String(i.who ?? '')}`.trim(), `${link}?faktura=${String(i.id)}`)
  }
}

/** Limit DPH: příjmy v Kč za kalendářní rok napříč účtem. Upozorní na 80 % a na překročení. */
async function queueVatLimit(scope: Scope, sender: Sender, today: string): Promise<void> {
  if (!isOn(sender, 'vat_limit')) return
  const ctx: WsContext = { userId: 'system', accountId: scope.accountId, role: 'owner' }
  const settings = await getTaxSettings(ctx)
  if (settings.vatPayer) return
  const year = today.slice(0, 4)
  const [row] = await wsDb(scope)`
    SELECT COALESCE(sum(amount), 0)::numeric AS total FROM ws.transactions
    WHERE account_id = ${scope.accountId} AND kind = 'income' AND currency = 'CZK'
      AND occurred_on >= ${`${year}-01-01`}::date AND occurred_on <= ${today}::date`
  const total = Number(row?.total ?? 0)
  const level = total >= RATES.vatLimit ? 100 : total >= RATES.vatLimit * 0.8 ? 80 : 0
  if (!level) return
  const title = level === 100 ? 'Příjmy přesáhly limit pro DPH' : 'Blížíte se limitu pro DPH'
  await ownerEmail(
    scope,
    sender,
    'vat_limit',
    {
      subject: title,
      body:
        level === 100
          ? `Letošní přijaté platby v korunách jsou ${money(total, 'CZK')}, limit je ${money(RATES.vatLimit, 'CZK')}. Ověřte prosím s účetní nebo na finančním úřadu, od kdy se stáváte plátcem DPH.`
          : `Letošní přijaté platby v korunách jsou ${money(total, 'CZK')}, limit pro DPH je ${money(RATES.vatLimit, 'CZK')}. Je dobré to probrat s účetní dřív, než limit přesáhnete.`,
      blocks: [
        { kind: 'note', text: 'Počítáme jen platby zapsané v aplikaci. Obrat pro DPH se může lišit, rozhoduje skutečný stav.' },
        { kind: 'buttons', items: [{ label: 'Otevřít daně', url: appLink(sender.business.slug, '/dane') }] },
      ],
    },
    { dedupeKey: `vat:${year}:${level}` },
  )
  await bell(scope, sender.business.id, 'vat_limit', title, money(total, 'CZK'), `/w/${sender.business.slug}/dane?limit=${year}-${level}`)
}

// --- Přehledy ---------------------------------------------------------------------

async function queueDaily(scope: Scope, sender: Sender, today: string): Promise<void> {
  if (!isOn(sender, 'daily_digest')) return
  const acc = scope.accountId
  const biz = sender.business.id
  const [visits, requests] = await wsDb(scope).batch([
    q`SELECT a.starts_at, c.name, s.name AS service FROM ws.appointments a
      LEFT JOIN ws.customers c ON c.account_id = a.account_id AND c.id = a.customer_id
      LEFT JOIN ws.services s ON s.account_id = a.account_id AND s.id = a.service_id
      WHERE a.account_id = ${acc} AND a.business_id = ${biz} AND a.kind = 'visit' AND a.status = 'confirmed'
        AND a.starts_at >= ${pragueToUtc(today, 0)} AND a.starts_at < ${pragueToUtc(addDays(today, 1), 0)}
      ORDER BY a.starts_at LIMIT 30`,
    q`SELECT r.created_at, c.name, s.name AS service FROM ws.requests r
      LEFT JOIN ws.customers c ON c.account_id = r.account_id AND c.id = r.customer_id
      LEFT JOIN ws.services s ON s.account_id = r.account_id AND s.id = r.service_id
      WHERE r.account_id = ${acc} AND r.business_id = ${biz} AND r.status = 'new' AND NOT r.is_test
      ORDER BY r.created_at LIMIT 20`,
  ])
  if (visits.length === 0 && requests.length === 0) return
  const blocks: EmailBlock[] = [
    {
      kind: 'list',
      title: 'Dnešní termíny',
      empty: 'Dnes žádný termín.',
      items: visits.map((v: WsRow) => ({
        main: [v.name, v.service].filter(Boolean).join(' · ') || 'Termín',
        side: formatMinutes(pragueParts(new Date(v.starts_at as string)).minutes),
      })),
    },
    {
      kind: 'list',
      title: 'Čeká na odpověď',
      empty: 'Všechny poptávky jsou vyřízené.',
      items: requests.map((r: WsRow) => ({ main: [r.name, r.service].filter(Boolean).join(' · ') || 'Poptávka', side: formatDayShort(pragueParts(new Date(r.created_at as string)).date) })),
    },
    { kind: 'buttons', items: [{ label: 'Otevřít Dnes', url: appLink(sender.business.slug) }] },
  ]
  await ownerEmail(
    scope,
    sender,
    'daily_digest',
    {
      subject: visits.length ? `Dnes máte ${visits.length} ${visits.length === 1 ? 'termín' : visits.length < 5 ? 'termíny' : 'termínů'}` : 'Čekají na vás poptávky',
      body: 'Dobré ráno. Tady je, co vás dnes čeká.',
      blocks,
    },
    { dedupeKey: `daily:${sender.business.id}:${today}`, validUntil: pragueToUtc(addDays(today, 1), 0) },
  )
}

async function queueWeekly(scope: Scope, sender: Sender, today: string): Promise<void> {
  if (!isOn(sender, 'weekly_digest')) return
  const acc = scope.accountId
  const biz = sender.business.id
  const [upcoming, noShows] = await wsDb(scope).batch([
    q`SELECT (a.starts_at AT TIME ZONE 'Europe/Prague')::date::text AS day, count(*)::int AS n FROM ws.appointments a
      WHERE a.account_id = ${acc} AND a.business_id = ${biz} AND a.kind = 'visit' AND a.status = 'confirmed'
        AND a.starts_at >= ${pragueToUtc(today, 0)} AND a.starts_at < ${pragueToUtc(addDays(today, 7), 0)}
      GROUP BY 1 ORDER BY 1`,
    q`SELECT c.name FROM ws.appointments a JOIN ws.customers c ON c.account_id = a.account_id AND c.id = a.customer_id
      WHERE a.account_id = ${acc} AND a.business_id = ${biz} AND a.status = 'no_show'
        AND a.starts_at >= ${pragueToUtc(addDays(today, -7), 0)} AND a.starts_at < ${pragueToUtc(today, 0)}
      ORDER BY a.starts_at LIMIT 10`,
  ])
  const ctx: WsContext = { userId: 'system', accountId: acc, role: 'owner' }
  const suggestions = sender.modules.has('reminders') || sender.modules.has('loyalty') ? await getOutreachSuggestions(ctx, { id: biz }) : []
  const blocks: EmailBlock[] = [
    {
      kind: 'list',
      title: 'Týden dopředu',
      empty: 'Zatím žádné termíny.',
      items: upcoming.map((d: WsRow) => ({ main: formatDayShort(String(d.day)), side: `${Number(d.n)}×` })),
    },
  ]
  if (noShows.length) blocks.push({ kind: 'list', title: 'Minulý týden nepřišli', items: noShows.map((r: WsRow) => ({ main: String(r.name) })) })
  if (suggestions.length) {
    blocks.push({ kind: 'list', title: 'Komu napsat', items: suggestions.slice(0, 6).map((s) => ({ main: s.name, side: s.reason })) })
  }
  blocks.push({ kind: 'buttons', items: [{ label: 'Otevřít kalendář', url: appLink(sender.business.slug, '/kalendar') }] })
  await ownerEmail(
    scope,
    sender,
    'weekly_digest',
    { subject: 'Váš týden', body: 'Dobré ráno. Takhle vypadá tenhle týden.', blocks },
    { dedupeKey: `weekly:${sender.business.id}:${today}`, validUntil: pragueToUtc(addDays(today, 2), 0) },
  )
}

async function queueMonthly(scope: Scope, sender: Sender, today: string): Promise<void> {
  if (!isOn(sender, 'monthly_digest')) return
  const acc = scope.accountId
  const biz = sender.business.id
  const monthStart = `${addDays(today, -1).slice(0, 7)}-01`
  const prevStart = `${addDays(monthStart, -1).slice(0, 7)}-01`
  const label = MONTHS[Number(monthStart.slice(5, 7)) - 1]
  const [income, requests, segments, best] = await wsDb(scope).batch([
    q`SELECT currency, (occurred_on >= ${monthStart}::date) AS current, sum(amount)::numeric AS total FROM ws.transactions
      WHERE account_id = ${acc} AND business_id = ${biz} AND kind = 'income' AND occurred_on >= ${prevStart}::date AND occurred_on < ${today}::date
      GROUP BY 1, 2`,
    q`SELECT count(*)::int AS total, count(*) FILTER (WHERE source IN ('web', 'widget', 'page', 'eshop'))::int AS web FROM ws.requests
      WHERE account_id = ${acc} AND business_id = ${biz} AND NOT is_test
        AND created_at >= ${pragueToUtc(monthStart, 0)} AND created_at < ${pragueToUtc(today, 0)}`,
    q`SELECT segment, count(*)::int AS n FROM ws.customer_segments WHERE account_id = ${acc} AND business_id = ${biz} GROUP BY 1`,
    q`SELECT s.name, count(*)::int AS n FROM ws.appointments a JOIN ws.services s ON s.account_id = a.account_id AND s.id = a.service_id
      WHERE a.account_id = ${acc} AND a.business_id = ${biz} AND a.kind = 'visit' AND a.status IN ('confirmed', 'completed')
        AND a.starts_at >= ${pragueToUtc(monthStart, 0)} AND a.starts_at < ${pragueToUtc(today, 0)}
      GROUP BY 1 ORDER BY 2 DESC LIMIT 1`,
  ])
  const byCurrency = new Map<string, { current: number; prev: number }>()
  for (const r of income) {
    const v = byCurrency.get(String(r.currency)) ?? { current: 0, prev: 0 }
    if (r.current) v.current = Number(r.total)
    else v.prev = Number(r.total)
    byCurrency.set(String(r.currency), v)
  }
  const rows: { label: string; value: string; mono?: boolean }[] = []
  for (const [currency, v] of Array.from(byCurrency.entries())) {
    rows.push({ label: `Příjmy (${currency})`, value: `${money(v.current, currency)} · předtím ${money(v.prev, currency)}`, mono: true })
  }
  const req = requests[0] ?? { total: 0, web: 0 }
  rows.push({ label: 'Poptávky', value: `${Number(req.total)} (z webu ${Number(req.web)})`, mono: true })
  const seg = new Map(segments.map((s: WsRow) => [String(s.segment), Number(s.n)]))
  rows.push({
    label: 'Zákazníci',
    value: (['new', 'regular', 'dormant'] as SegmentKey[]).map((k) => `${SEGMENT_LABELS[k]} ${seg.get(k) ?? 0}`).join(' · '),
  })
  if (best[0]) rows.push({ label: 'Nejčastější služba', value: `${String(best[0].name)} (${Number(best[0].n)}×)` })
  const blocks: EmailBlock[] = [{ kind: 'details', rows }]
  if (sender.modules.has('taxes') && Number(today.slice(0, 4)) === RATES.year) {
    const ctx: WsContext = { userId: 'system', accountId: acc, role: 'owner' }
    const settings = await getTaxSettings(ctx)
    const [ytd] = await wsDb(scope)`
      SELECT COALESCE(sum(amount) FILTER (WHERE kind = 'income'), 0)::numeric AS income, COALESCE(sum(amount) FILTER (WHERE kind = 'expense'), 0)::numeric AS expense
      FROM ws.transactions WHERE account_id = ${acc} AND currency = 'CZK' AND occurred_on >= ${`${today.slice(0, 4)}-01-01`}::date AND occurred_on < ${today}::date`
    const est = settings.vatPayer ? null : estimateTax(Number(ytd?.income ?? 0), Number(ytd?.expense ?? 0), settings, RATES.year)
    if (est) blocks.push({ kind: 'note', text: `Odhad daně a pojištění za letošek podle dosavadních příjmů: ${money(est.total, 'CZK')}. Je to jen vodítko, ne daňové přiznání.` })
  }
  blocks.push({ kind: 'buttons', items: [{ label: 'Otevřít peníze', url: appLink(sender.business.slug, '/penize') }] })
  await ownerEmail(
    scope,
    sender,
    'monthly_digest',
    { subject: `Jak se dařilo: ${label}`, body: `Krátké shrnutí za ${label}. Částky v různých měnách nesčítáme.`, blocks },
    { dedupeKey: `monthly:${sender.business.id}:${monthStart}`, validUntil: pragueToUtc(addDays(today, 7), 0) },
  )
}

// --- Novinky ZakazIQ ---------------------------------------------------------------

async function queueNews(scope: Scope): Promise<number> {
  const acc = scope.accountId
  const [account, news, owners] = await wsDb(scope).batch([
    q`SELECT news_emails FROM ws.accounts WHERE id = ${acc}`,
    q`SELECT id, title, body, link_url FROM ws.product_news WHERE published_at IS NOT NULL AND published_at <= now()
      AND published_at > now() - interval '14 days' ORDER BY published_at`,
    q`SELECT email FROM ws.members WHERE account_id = ${acc} AND role = 'owner' AND email IS NOT NULL`,
  ])
  if (!account[0]?.news_emails || news.length === 0 || owners.length === 0) return 0
  const unsub = unsubscribeUrl(signLink({ kind: 'n', accountId: acc, id: null }))
  let n = 0
  for (const item of news) {
    for (const o of owners) {
      const email = renderEmail({
        brand: { name: 'ZakazIQ', color: null },
        subject: `Co jsme vylepšili: ${String(item.title)}`,
        body: String(item.body),
        blocks: item.link_url ? [{ kind: 'buttons', items: [{ label: 'Více', url: String(item.link_url) }] }] : [],
        footer: 'Novinky ZakazIQ posíláme jednou za čas. Upozornění na platby a bezpečnost chodí vždy.',
        unsubscribeUrl: unsub,
      })
      const id = await enqueueEmail(scope, {
        businessId: null,
        type: 'product_news',
        to: String(o.email),
        fromName: 'ZakazIQ',
        email,
        dedupeKey: `news:${String(item.id)}:${String(o.email).toLowerCase()}`,
        unsubscribeUrl: unsub,
      })
      if (id) n++
    }
  }
  return n
}

// --- Denní běh -------------------------------------------------------------------

export type DailyEmailRun = { businesses: number; reminders: number; news: number; failed: number; sent: number }

export async function runDailyEmails(now: Date = new Date()): Promise<DailyEmailRun> {
  const today = pragueParts(now).date
  const weekday = weekdayOf(today)
  const list = await wsSystem<{ account_id: string; business_id: string }>`SELECT account_id, business_id FROM ws.active_businesses()`
  const out: DailyEmailRun = { businesses: list.length, reminders: 0, news: 0, failed: 0, sent: 0 }
  const accounts = new Set<string>()
  for (const b of list) {
    const scope = { accountId: b.account_id }
    try {
      const sender = await loadSender(scope, b.business_id)
      if (!sender) continue
      out.reminders += await queueReminders(scope, sender, today)
      await queueOverdue(scope, sender, today)
      if (!accounts.has(b.account_id)) await queueVatLimit(scope, sender, today)
      if (weekday >= 1 && weekday <= 5) await queueDaily(scope, sender, today)
      if (weekday === 1) await queueWeekly(scope, sender, today)
      if (today.endsWith('-01')) await queueMonthly(scope, sender, today)
      if (!accounts.has(b.account_id)) out.news += await queueNews(scope)
    } catch (e) {
      out.failed++
      console.error('cron.ws-email', { accountId: b.account_id, error: e instanceof Error ? e.message : 'unknown' })
    }
    accounts.add(b.account_id)
  }
  const flushed = await flushAll({ budgetMs: 35_000 })
  out.sent = flushed.sent
  return out
}
