import { describe, it, expect, vi, beforeEach } from 'vitest'

// Dnes (/dashboard) skládá čas „další akce" z data a hodiny z Hovorů.
// Sloupec `next_action_date` je v Postgresu typ `date` a Neon ho vrací jako
// Date (místní půlnoc) — původní kód z něj dělal řetězec přes String(), takže
// vznikl neplatný ISO čas a celá stránka vracela 500 (RangeError: Invalid time
// value). Tenhle test hlídá, že to platí pro Date i pro řetězec.

const lead = (date: Date | string, time: string | null) => ({
  id: 'lead-1',
  company_name: 'Pekárna Ukázková',
  next_action: 'Zavolat',
  next_action_date: date,
  next_action_time: time,
})

let leadRows: ReturnType<typeof lead>[] = []
let incomeRows: Record<string, number>[] = []
let unpaidRows: Record<string, unknown>[] = []
/** Tabulka, kterou dotaz nenajde (migrace ještě neproběhla). */
let missingTable: string | null = null

vi.mock('@/lib/db', () => {
  const sql = (strings: TemplateStringsArray | string, ...values: unknown[]) => {
    const text = (typeof strings === 'string' ? strings : strings.join(' ? ')).replace(/\s+/g, ' ')
    if (missingTable && text.includes(missingTable)) {
      return Promise.reject(new Error(`relation "${missingTable}" does not exist`))
    }
    if (text.includes('FROM client_leads')) return Promise.resolve(leadRows)
    if (text.includes('FROM finance_transactions')) return Promise.resolve(incomeRows)
    if (text.includes('FROM invoices')) return Promise.resolve(unpaidRows)
    return Promise.resolve([])
  }
  return { sql: Object.assign(sql, { query: (text: string, params?: unknown[]) => sql(text, params) }) }
})

const { loadTodayData, loadMonthMoney } = await import('@/lib/admin-today-queries')
const { calculateTax } = await import('@/lib/tax')

describe('loadTodayData — čas další akce z Hovorů', () => {
  it('zvládne datum jako Date z Postgresu', async () => {
    leadRows = [lead(new Date(2026, 10, 12, 0, 0, 0), '10:00:00')]
    const data = await loadTodayData()
    const item = data.upcoming.find((u) => u.id === 'call-lead-1')
    expect(item).toBeTruthy()
    expect(Number.isNaN(Date.parse(item!.at))).toBe(false)
    expect(item!.at.slice(0, 10)).toBe(new Date(2026, 10, 12, 10, 0).toISOString().slice(0, 10))
  })

  it('zvládne datum jako řetězec', async () => {
    leadRows = [lead('2026-11-12', '10:00:00')]
    const data = await loadTodayData()
    const item = data.upcoming.find((u) => u.id === 'call-lead-1')
    expect(Number.isNaN(Date.parse(item!.at))).toBe(false)
  })

  it('bez hodiny použije 9:00', async () => {
    leadRows = [lead('2026-11-12', null)]
    const data = await loadTodayData()
    const item = data.upcoming.find((u) => u.id === 'call-lead-1')
    expect(Number.isNaN(Date.parse(item!.at))).toBe(false)
    expect(new Date(item!.at).getHours()).toBe(9)
  })
})

// Peníze v pravém sloupci Dnes (AD03). Čísla musí sedět na Finance › Podnikání,
// proto se daň porovnává se stejnou funkcí, jakou počítá kalkulačka.
describe('loadMonthMoney — peníze za tenhle měsíc', () => {
  beforeEach(() => {
    missingTable = null
    incomeRows = [{ month_income: 48_000, month_declared: 30_000, year_declared: 420_000 }]
    unpaidRows = [{ currency: 'CZK', amount: 24_200, count: 3, overdue: 1 }]
  })

  it('příjem měsíce, z toho přiznaný, a odhad daně ze celoročního přiznaného příjmu', async () => {
    const money = await loadMonthMoney('2026-11-11')
    expect(money.month).toBe('2026-11')
    expect(money.year).toBe(2026)
    expect(money.income).toBe(48_000)
    expect(money.declaredIncome).toBe(30_000)
    expect(money.yearDeclaredIncome).toBe(420_000)

    const tax = calculateTax({ income: 420_000, year: 2026 })
    expect(money.levies).toBe(tax.totalLevies)
    expect(money.monthlyReserve).toBe(tax.monthlyReserve)
    expect(money.ratesMatchYear).toBe(true)
  })

  it('nezaplacené faktury drží měny oddělené a hlásí, kolik je po splatnosti', async () => {
    unpaidRows = [
      { currency: 'CZK', amount: 24_200, count: 3, overdue: 1 },
      { currency: 'EUR', amount: 900, count: 1, overdue: 0 },
    ]
    const money = await loadMonthMoney('2026-11-11')
    expect(money.unpaidInvoices).toEqual([
      { currency: 'CZK', amount: 24_200, count: 3, overdue: 1 },
      { currency: 'EUR', amount: 900, count: 1, overdue: 0 },
    ])
  })

  it('chybějící tabulka ani prázdná databáze stránku neshodí', async () => {
    missingTable = 'finance_transactions'
    const money = await loadMonthMoney('2026-11-11')
    expect(money.income).toBe(0)
    expect(money.declaredIncome).toBe(0)
    expect(money.levies).toBe(0)

    missingTable = null
    incomeRows = []
    unpaidRows = []
    const empty = await loadMonthMoney('2026-11-11')
    expect(empty.income).toBe(0)
    expect(empty.unpaidInvoices).toEqual([])
  })
})
