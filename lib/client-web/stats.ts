// Poptávky z webu klienta (KP17, R-129): čísla po měsících. Čisté funkce bez
// databáze — sdílí je admin (detail zakázky) i klientský prostor.

export type WebEventKind = 'poptavka' | 'objednavka'

export type WebLeadMonth = {
  /** 'YYYY-MM' v pražském čase. */
  month: string
  poptavky: number
  objednavky: number
}

export type WebLeadStats = {
  /** Posledních 12 měsíců, nejstarší první, včetně měsíců bez události. */
  months: WebLeadMonth[]
  thisMonth: number
  lastMonth: number
  /** Součet za 12 měsíců. */
  total: number
  /** Přišla někdy objednávka? Podle toho se ukáže legenda o dvou druzích. */
  hasOrders: boolean
  hasRequests: boolean
}

const MONTH_RE = /^\d{4}-\d{2}$/

function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + by, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/** Pražský měsíc daného okamžiku jako 'YYYY-MM'. */
export function pragueMonthOf(at: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit' }).formatToParts(at)
  const y = parts.find((p) => p.type === 'year')?.value ?? '1970'
  const m = parts.find((p) => p.type === 'month')?.value ?? '01'
  return `${y}-${m}`
}

const toCount = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

/** 'YYYY-MM' z řádku databáze (date, nebo text 'YYYY-MM-DD'). */
export function monthKey(v: unknown): string | null {
  if (v instanceof Date) return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, '0')}`
  const s = String(v ?? '').slice(0, 7)
  return MONTH_RE.test(s) ? s : null
}

/**
 * Složí 12 měsíců končících `currentMonth` z řádků (měsíc, počty). Chybějící
 * měsíc = nula, měsíc mimo okno se zahodí, záporné nebo nesmyslné číslo = nula.
 */
export function buildWebLeadStats(
  rows: { month: unknown; poptavky: unknown; objednavky: unknown }[],
  currentMonth: string = pragueMonthOf(),
): WebLeadStats {
  const byMonth = new Map<string, WebLeadMonth>()
  for (const r of rows) {
    const key = monthKey(r.month)
    if (!key) continue
    const prev = byMonth.get(key)
    byMonth.set(key, {
      month: key,
      poptavky: (prev?.poptavky ?? 0) + toCount(r.poptavky),
      objednavky: (prev?.objednavky ?? 0) + toCount(r.objednavky),
    })
  }
  const months: WebLeadMonth[] = []
  for (let i = 11; i >= 0; i--) {
    const key = shiftMonth(currentMonth, -i)
    months.push(byMonth.get(key) ?? { month: key, poptavky: 0, objednavky: 0 })
  }
  const sum = (m: WebLeadMonth) => m.poptavky + m.objednavky
  return {
    months,
    thisMonth: sum(months[11]),
    lastMonth: sum(months[10]),
    total: months.reduce((acc, m) => acc + sum(m), 0),
    hasOrders: months.some((m) => m.objednavky > 0),
    hasRequests: months.some((m) => m.poptavky > 0),
  }
}

const MONTHS_SHORT = ['led', 'úno', 'bře', 'dub', 'kvě', 'čvn', 'čvc', 'srp', 'zář', 'říj', 'lis', 'pro']
const MONTHS_LONG = ['leden', 'únor', 'březen', 'duben', 'květen', 'červen', 'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec']

export const monthShort = (month: string): string => MONTHS_SHORT[Number(month.slice(5, 7)) - 1] ?? month
export const monthLong = (month: string): string => {
  const name = MONTHS_LONG[Number(month.slice(5, 7)) - 1] ?? month
  return `${name} ${month.slice(0, 4)}`
}

/** „1 poptávka", „3 poptávky", „5 poptávek" — počítá obojí druhy dohromady. */
export function leadsLabel(n: number): string {
  if (n === 1) return '1 poptávka'
  if (n >= 2 && n <= 4) return `${n} poptávky`
  return `${n.toLocaleString('cs-CZ')} poptávek`
}

/** Věta pro čtečku: co graf ukazuje. */
export function webLeadsSummary(stats: WebLeadStats): string {
  if (stats.total === 0) return 'Za posledních 12 měsíců zatím žádná poptávka z webu.'
  const best = stats.months.reduce((a, b) => (b.poptavky + b.objednavky > a.poptavky + a.objednavky ? b : a))
  const n = (v: number) => v.toLocaleString('cs-CZ')
  return `Za posledních 12 měsíců ${leadsLabel(stats.total)} z webu. Tento měsíc ${n(stats.thisMonth)}, minulý měsíc ${n(stats.lastMonth)}. Nejvíc za ${monthLong(best.month)}: ${n(best.poptavky + best.objednavky)}.`
}
