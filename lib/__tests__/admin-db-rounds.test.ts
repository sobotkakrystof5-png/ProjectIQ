import { describe, it, expect, beforeEach } from 'vitest'
import { setAdminDbForTests } from '@/lib/admin/db'
import { fakeAdminDriver } from './helpers/admin-driver'
import { loadTodayData, loadMonthMoney, loadTodayScreen } from '@/lib/admin-today-queries'
import { loadAdminCounts } from '@/lib/admin-counts'

// Měření rychlosti adminu (AD00, snížené v AD06): kolik požadavků do databáze
// stojí načtení obrazovky a kolik z nich jde za sebou. Čítač je záměrně jen
// tady, v aplikačním kódu nezůstává. Počty jsou stropy — když zase narostou,
// test padne.
//
// Kolo = jeden požadavek do databáze. Dávka (`adminDb.batch`) je jeden
// požadavek, i když je v ní osm dotazů — po síti je to jedno volání a o to tu
// jde. Vlna = kola, která odstartovala společně; další vlna znamená čekání na
// odpověď té předchozí.

const probe = fakeAdminDriver((text) => {
  // Dotazy na odznaky v menu čekají jeden řádek s čísly, výpisy snesou prázdno.
  if (/AS leads/i.test(text)) return [{ leads: 0, notifications: 0 }]
  if (/^SELECT count\(\*\)::int AS count FROM/i.test(text)) return [{ count: 0 }]
  return []
})
setAdminDbForTests(probe.driver)

describe('kola do databáze — admin po AD06', () => {
  beforeEach(() => probe.reset())

  it('Dnes (/dashboard) stojí jeden požadavek — šest dotazů v jedné dávce', async () => {
    await loadTodayData()
    expect(probe.rounds()).toBe(1)
    expect(probe.waves()).toBe(1)
    expect(probe.queries()).toHaveLength(6)
  })

  it('peníze za měsíc (pravý sloupec Dnes) stojí jeden požadavek', async () => {
    await loadMonthMoney('2026-11-11')
    expect(probe.rounds()).toBe(1)
    expect(probe.queries()).toHaveLength(2)
  })

  it('Dnes i s penězi je jeden požadavek — jedna dávka pro celou obrazovku', async () => {
    await loadTodayScreen('2026-11-11')
    expect(probe.rounds()).toBe(1)
    expect(probe.waves()).toBe(1)
    expect(probe.queries()).toHaveLength(8)
  })

  it('odznaky v menu (kostra administrace) stojí jeden požadavek', async () => {
    await loadAdminCounts()
    expect(probe.rounds()).toBe(1)
    expect(probe.waves()).toBe(1)
    expect(probe.queries()).toHaveLength(3)
  })

  it('kostra + Dnes dohromady: dvě kola ve dvou vlnách', async () => {
    // Takhle to běží ve stránce: layout si řekne o odznaky, stránka o obsah.
    // Dvě vlny proto, že menu se kreslí dřív než obsah — ale každá je jedna
    // dávka, ne tři a osm dotazů jako před AD06.
    await loadAdminCounts()
    await loadTodayScreen('2026-11-11')
    expect(probe.rounds()).toBe(2)
    expect(probe.waves()).toBe(2)
  })
})
