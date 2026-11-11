import { describe, it, expect, vi } from 'vitest'

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

vi.mock('@/lib/db', () => {
  const sql = (strings: TemplateStringsArray | string, ...values: unknown[]) => {
    const text = (typeof strings === 'string' ? strings : strings.join(' ? ')).replace(/\s+/g, ' ')
    if (text.includes('FROM client_leads')) return Promise.resolve(leadRows)
    return Promise.resolve([])
  }
  return { sql: Object.assign(sql, { query: (text: string, params?: unknown[]) => sql(text, params) }) }
})

const { loadTodayData } = await import('@/lib/admin-today-queries')

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
