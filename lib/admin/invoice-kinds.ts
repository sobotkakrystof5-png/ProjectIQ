import { z } from 'zod'

/**
 * Druh faktury a rozpis ceny zakázky (R-143).
 *
 * Před každou fakturou se rozhoduje, o jakou jde: za celé dílo najednou,
 * zálohová (obvykle 30 % předem), částečná (další část ceny, třeba
 * 30 / 30 / 40) nebo finální (všechno, co zbývá). Procento se počítá z ceny
 * zakázky a nikdy nesmí přesáhnout to, co ještě nikdo nevyfakturoval.
 *
 * Soubor je čistý (bez databáze), aby podle něj počítal formulář
 * v prohlížeči i server. Server si všechno spočítá znovu z databáze —
 * částka z prohlížeče se na doklad nikdy nedostane.
 */

export const INVOICE_KINDS = ['single', 'deposit', 'partial', 'final'] as const
export type InvoiceKind = (typeof INVOICE_KINDS)[number]

export function isInvoiceKind(value: unknown): value is InvoiceKind {
  return typeof value === 'string' && (INVOICE_KINDS as readonly string[]).includes(value)
}

/** Volba ve formuláři. */
export const KIND_LABELS: Record<InvoiceKind, string> = {
  single: 'Za celé dílo',
  deposit: 'Zálohová',
  partial: 'Částečná',
  final: 'Finální',
}

export const KIND_HINTS: Record<InvoiceKind, string> = {
  single: 'Celá cena jednou fakturou.',
  deposit: 'Předem, než začnete. Obvykle 30 %.',
  partial: 'Další část ceny, třeba po odevzdání návrhu.',
  final: 'Doplatek všeho, co zbývá. Zálohy a předchozí faktury se odečtou.',
}

/** Nadpis dokladu na PDF. */
export const KIND_TITLES: Record<InvoiceKind, string> = {
  single: 'Faktura',
  deposit: 'Zálohová faktura',
  partial: 'Částečná faktura',
  final: 'Konečná faktura',
}

export const DEFAULT_DEPOSIT_PERCENT = 30

/** Co přijde z formuláře navíc k faktuře. Druh je povinný — rozhodnout se musí vždy. */
export const issueKindSchema = z.object({
  kind: z.enum(INVOICE_KINDS, { error: 'Vyberte, o jakou fakturu jde.' }),
  percent: z.number().finite().positive('Zadejte procento větší než nula.').max(100, 'Víc než 100 % to být nemůže.').nullable().default(null),
})

export type IssueKindInput = z.infer<typeof issueKindSchema>

// ─── Rozpis ceny zakázky ─────────────────────────────────────────────────────

export type BillingInvoice = {
  number: string
  /** Druh dokladu; null = faktura vystavená před R-143 nebo nahraná z PDF. */
  kind: InvoiceKind | null
  amount: number
  paid: boolean
}

/**
 * Peníze jedné zakázky. `paid` se počítá stejně jako „zbývá doplatit" všude
 * jinde (`remainingToPay`, R-110, R-125): vlastní záloha, ručně zapsané
 * zálohy a zaplacené faktury. `invoices` jsou platné korunové doklady
 * zakázky od nejstaršího — zaplacené i čekající.
 */
export type ProjectBilling = {
  projectId: string
  label: string
  /** Popis zakázky, ze kterého se skládá text položky. */
  description: string
  price: number
  paid: number
  invoices: BillingInvoice[]
}

export type BillingOverview = {
  price: number
  /** Zaplaceno. */
  paid: number
  /** Vyfakturováno, ale ještě nezaplaceno. */
  open: number
  /** Zbývá vyfakturovat. */
  free: number
  /** Zbývá doplatit = cena − zaplaceno. */
  toPay: number
  /** Zaplaceno bez faktury (zálohy zapsané ručně). */
  paidOutside: number
  paidPct: number
  openPct: number
  freePct: number
}

export const round2 = (n: number) => Math.round(n * 100) / 100

/** Procento z ceny na dvě desetinná místa. */
function pctOf(part: number, price: number): number {
  return price > 0 ? round2((part / price) * 100) : 0
}

export function billingOverview(b: Pick<ProjectBilling, 'price' | 'paid' | 'invoices'>): BillingOverview {
  const price = round2(Math.max(0, b.price))
  const paid = round2(Math.min(price, Math.max(0, b.paid)))
  const openRaw = b.invoices.filter(i => !i.paid).reduce((s, i) => s + i.amount, 0)
  const open = round2(Math.min(price - paid, Math.max(0, openRaw)))
  const free = round2(Math.max(0, price - paid - open))
  const paidInvoices = b.invoices.filter(i => i.paid).reduce((s, i) => s + i.amount, 0)
  return {
    price,
    paid,
    open,
    free,
    toPay: round2(price - paid),
    paidOutside: round2(Math.max(0, paid - paidInvoices)),
    paidPct: pctOf(paid, price),
    openPct: pctOf(open, price),
    freePct: pctOf(free, price),
  }
}

/** Je u zakázky už něco zaplaceno nebo vyfakturováno? */
function started(b: Pick<ProjectBilling, 'paid' | 'invoices'>): boolean {
  return b.paid > 0 || b.invoices.length > 0
}

/**
 * Které druhy jdou u zakázky vystavit. `null` = jde, text = proč ne
 * (ukáže se u volby ve formuláři i jako chyba ze serveru).
 */
export function kindAvailability(b: ProjectBilling | null): Record<InvoiceKind, string | null> {
  if (!b) {
    const why = 'Vyberte zakázku. Procento se počítá z její ceny.'
    return { single: null, deposit: why, partial: why, final: why }
  }
  if (b.price <= 0) {
    const why = 'Zakázka nemá cenu. Doplňte ji u zakázky.'
    return { single: null, deposit: why, partial: why, final: why }
  }
  const o = billingOverview(b)
  if (o.free <= 0) {
    const why = 'Zakázka je celá vyfakturovaná.'
    return { single: why, deposit: why, partial: why, final: why }
  }
  return {
    single: started(b) ? 'U zakázky už je záloha nebo faktura. Vyberte částečnou nebo finální.' : null,
    deposit: null,
    partial: null,
    final: started(b) ? null : 'Zatím není co odečíst. Vyberte fakturu za celé dílo.',
  }
}

/** 30 % z 100 000 Kč = 30 000 Kč. Na celé koruny; zbytek po zaokrouhlení dorovná finální faktura. */
export function amountForPercent(price: number, percent: number): number {
  return Math.round((price * percent) / 100)
}

/** „30", „33,33" — procento pro text na faktuře. */
export function formatPercent(percent: number): string {
  return new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 2 }).format(percent)
}

/**
 * Rozpis na dokladu: cena zakázky, co už je vyfakturované a zaplacené,
 * tahle faktura a co po ní zbývá. Snímek z okamžiku vystavení — pozdější
 * faktury ho nepřepíšou.
 */
export type Settlement = {
  price: number
  invoices: BillingInvoice[]
  paidOutside: number
  thisAmount: number
  thisPercent: number
  remainingAfter: number
}

export type KindPlan = {
  kind: InvoiceKind
  /** Kolik procent ceny faktura pokrývá; u faktury za celé dílo null. */
  percent: number | null
  /** Částka faktury; u faktury za celé dílo null = podle položek. */
  amount: number | null
  settlement: Settlement | null
}

export type KindPlanResult = { ok: true; plan: KindPlan } | { ok: false; error: string }

function czk(amount: number): string {
  return new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK', maximumFractionDigits: 2 }).format(amount)
}

/**
 * Z druhu a procenta spočítá částku faktury a rozpis. Stejná funkce běží
 * ve formuláři (náhled) i na serveru (to, co se opravdu vystaví).
 */
export function resolveKindPlan(kind: InvoiceKind, percent: number | null, billing: ProjectBilling | null): KindPlanResult {
  const why = kindAvailability(billing)[kind]
  if (why) return { ok: false, error: why }
  if (kind === 'single' || !billing) return { ok: true, plan: { kind, percent: null, amount: null, settlement: null } }

  const o = billingOverview(billing)
  let amount: number
  let share: number
  if (kind === 'final') {
    amount = o.free
    share = pctOf(o.free, o.price)
  } else {
    if (percent === null || !(percent > 0)) return { ok: false, error: 'Napište, kolik procent z ceny fakturujete.' }
    share = round2(percent)
    amount = amountForPercent(o.price, share)
    // Rozdíl do koruny je zaokrouhlení, ne přefakturování: poslední část
    // „40 %" z 33 333 Kč má být přesně to, co zbývá.
    if (Math.abs(amount - o.free) < 1) amount = o.free
    if (amount <= 0) return { ok: false, error: 'Z takového procenta vychází nula korun.' }
    if (amount > o.free + 0.004) {
      return { ok: false, error: `Vyfakturovat zbývá jen ${czk(o.free)}, tedy ${formatPercent(o.freePct)} % ceny.` }
    }
  }

  return {
    ok: true,
    plan: {
      kind,
      percent: share,
      amount,
      settlement: {
        price: o.price,
        invoices: billing.invoices,
        paidOutside: o.paidOutside,
        thisAmount: amount,
        thisPercent: share,
        remainingAfter: round2(Math.max(0, o.price - o.paid - o.open - amount)),
      },
    },
  }
}

/** Text položky: „Web na míru — záloha 30 %". */
export function kindItemDescription(kind: InvoiceKind, base: string, percent: number | null): string {
  const what = base.trim() || 'Zakázka'
  if (kind === 'single' || percent === null) return what
  const pct = formatPercent(percent)
  if (kind === 'deposit') return `${what} — záloha ${pct} %`
  if (kind === 'final') return `${what} — doplatek ${pct} % ceny`
  return `${what} — část ${pct} % ceny`
}
