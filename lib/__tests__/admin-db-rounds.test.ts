import { describe, it, expect, vi, beforeEach } from 'vitest'

// Měření rychlosti adminu (AD00): kolik kol do databáze stojí načtení obrazovky
// a kolik z nich jde za sebou (vlny). Čítač je záměrně jen tady, v aplikačním
// kódu nezůstává. Počty jsou stropy — AD06 a AD08 je mají snižovat, tenhle test
// hlídá, aby zase nenarostly.
//
// Kolo = jedno zavolání `sql`. Vlna = skupina kol, která odstartovala společně
// (Promise.all); každá další vlna znamená čekání na odpověď předchozí.

let rounds = 0
let waves = 0
let inFlight = 0
const seen: string[] = []

function rowsFor(text: string): Record<string, unknown>[] {
  const flat = text.replace(/\s+/g, ' ').trim()
  // Dotazy na odznaky v menu čekají jeden řádek s čísly, výpisy snesou prázdno.
  if (/AS leads/i.test(flat)) return [{ leads: 0, notifications: 0 }]
  if (/^SELECT count\(\*\)::int AS count FROM/i.test(flat)) return [{ count: 0 }]
  return []
}

vi.mock('@/lib/db', () => {
  const sql = (strings: TemplateStringsArray | string, ...values: unknown[]) => {
    const text = typeof strings === 'string' ? strings : strings.join(' ? ')
    rounds++
    seen.push(text.replace(/\s+/g, ' ').trim().slice(0, 60))
    if (inFlight === 0) waves++
    inFlight++
    return (async () => {
      await Promise.resolve()
      inFlight--
      return rowsFor(text)
    })()
  }
  return { sql: Object.assign(sql, { query: (text: string, params?: unknown[]) => sql(text, params) }) }
})

const { loadTodayData } = await import('@/lib/admin-today-queries')
const { loadAdminCounts } = await import('@/lib/admin-counts')

function reset() {
  rounds = 0
  waves = 0
  inFlight = 0
  seen.length = 0
}

describe('kola do databáze — výchozí měření adminu', () => {
  beforeEach(reset)

  it('Dnes (/dashboard) načte data v jedné vlně', async () => {
    await loadTodayData()
    expect(rounds).toBeLessThanOrEqual(6)
    expect(waves).toBe(1)
  })

  it('odznaky v menu (kostra administrace) stojí nejvýš 3 kola v jedné vlně', async () => {
    await loadAdminCounts()
    expect(rounds).toBeLessThanOrEqual(3)
    expect(waves).toBe(1)
  })

  it('kostra + Dnes dohromady: menu a obsah se načítají odděleně, tedy ve dvou vlnách', async () => {
    // Takhle to dnes běží ve stránce: layout si řekne o odznaky, stránka o data.
    await loadAdminCounts()
    await loadTodayData()
    expect(rounds).toBeLessThanOrEqual(9)
    expect(waves).toBe(2)
  })
})
