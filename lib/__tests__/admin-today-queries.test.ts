import { describe, it, expect, beforeEach } from 'vitest'
import { setAdminDbForTests } from '@/lib/admin/db'
import { fakeAdminDriver } from './helpers/admin-driver'
import { loadTodayData, loadMonthMoney, loadTodayScreen } from '@/lib/admin-today-queries'
import { calculateTax } from '@/lib/tax'

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

// Od AD06 čte Dnes přes dávkovaný `lib/admin/db.ts`, takže se podstrčí
// ovladač, ne modul `@/lib/db`. Chyba jednoho dotazu shodí celou dávku —
// `batchTolerant` pak dotazy zkusí jednotlivě a tohle to ověřuje.
const probe = fakeAdminDriver((text) => {
  if (missingTable && text.includes(missingTable)) {
    throw new Error(`relation "${missingTable}" does not exist`)
  }
  if (text.includes('FROM client_leads')) return leadRows as unknown as Record<string, unknown>[]
  if (text.includes('FROM finance_transactions')) return incomeRows
  if (text.includes('FROM invoices')) return unpaidRows
  return []
})
setAdminDbForTests(probe.driver)


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

// Měření AD06: Dnes stálo šest kol do databáze a peníze další dvě. Dávka
// z toho dělá jeden požadavek — tenhle test je zároveň strop.
describe('kola do databáze — Dnes', () => {
  beforeEach(() => {
    missingTable = null
    probe.reset()
  })

  it('celá obrazovka Dnes stojí jeden požadavek', async () => {
    await loadTodayScreen('2026-11-11')
    expect(probe.rounds()).toBe(1)
    expect(probe.waves()).toBe(1)
    expect(probe.queries()).toHaveLength(8)
  })

  it('chybějící tabulka shodí dávku, ale ne obrazovku — zbytek se dotáhne jednotlivě', async () => {
    missingTable = 'client_requests'
    const { data } = await loadTodayScreen('2026-11-11')
    expect(data.requests).toEqual([])
    // 1 neúspěšná dávka + 8 jednotlivých pokusů
    expect(probe.rounds()).toBe(9)
  })
})
