import { describe, it, expect } from 'vitest'
import { parseRssItems, matchesTaxKeywords, TAX_NEWS_FEEDS } from '@/lib/tax-news'

/**
 * Testy běží nad fixturami odvozenými z reálných odpovědí obou úřadů —
 * zejména z toho, čím se liší: Finanční správa neposílá `<guid>` a popis
 * cpe do CDATA jako HTML, ČSSZ posílá `<guid isPermaLink="false">`
 * a čistý text. Žádná síť.
 */

const FINANCNI_SPRAVA_XML = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>RSS Novinky</title>
    <item>
      <title>Krátí se čas na podání daňového přiznání k daním z příjmů</title>
      <link>https://financnisprava.gov.cz/cs/tiskove-zpravy-2026/krati-se-cas</link>
      <description><![CDATA[<p style="text-align:justify">Elektronicky ho lze podat do&nbsp;4.&nbsp;května&nbsp;2026.</p>]]></description>
      <pubDate>Thu, 03 Sep 2026 00:00:00 +02:00</pubDate>
    </item>
    <item>
      <title>Vše o EET 2.0 na jednom m&#237;stě</title>
      <link>https://financnisprava.gov.cz/cs/tiskove-zpravy-2026/eet-web</link>
      <description><![CDATA[<p>Nov&#253; web k elektronické evidenci tržeb.</p>]]></description>
      <pubDate>Wed, 02 Sep 2026 00:00:00 +02:00</pubDate>
    </item>
  </channel>
</rss>`

const CSSZ_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:dc="http://purl.org/dc/elements/1.1/" version="2.0">
  <channel>
    <item>
      <title>Počet OSVČ dál roste</title>
      <link>https://www.cssz.gov.cz/web/cz/content/id/3340625</link>
      <description>ČSSZ vydává nového průvodce sociálním zabezpečením.</description>
      <pubDate>Fri, 21 Aug 2026 20:56:00 GMT</pubDate>
      <guid isPermaLink="false">CSSZ-3340625</guid>
      <dc:date>2026-08-21T20:56:00Z</dc:date>
    </item>
    <item>
      <title>Pravidelný česko-německý poradenský den k důchodům v Pasově</title>
      <link>https://www.cssz.gov.cz/web/cz/content/id/3340999</link>
      <description>Poradenství k důchodovým nárokům.</description>
      <pubDate>Mon, 18 Aug 2026 08:00:00 GMT</pubDate>
      <guid isPermaLink="false">CSSZ-3340999</guid>
    </item>
  </channel>
</rss>`

describe('parseRssItems', () => {
  it('vytáhne položky z kanálu Finanční správy', () => {
    const items = parseRssItems(FINANCNI_SPRAVA_XML)

    expect(items).toHaveLength(2)
    expect(items[0].title).toBe('Krátí se čas na podání daňového přiznání k daním z příjmů')
    expect(items[0].link).toBe('https://financnisprava.gov.cz/cs/tiskove-zpravy-2026/krati-se-cas')
  })

  it('bez <guid> spadne na odkaz — jinak by cron zakládal duplicity každý běh', () => {
    const items = parseRssItems(FINANCNI_SPRAVA_XML)

    expect(items[0].guid).toBe(items[0].link)
    expect(items.every(i => i.guid.length > 0)).toBe(true)
  })

  it('respektuje vlastní <guid> od ČSSZ', () => {
    const items = parseRssItems(CSSZ_XML)

    expect(items[0].guid).toBe('CSSZ-3340625')
    expect(items[0].guid).not.toBe(items[0].link)
  })

  it('z popisu odstraní CDATA, HTML tagy i entity', () => {
    const [item] = parseRssItems(FINANCNI_SPRAVA_XML)

    expect(item.summary).toBe('Elektronicky ho lze podat do 4. května 2026.')
    expect(item.summary).not.toContain('<')
    expect(item.summary).not.toContain('&nbsp;')
  })

  it('dekóduje číselné entity v titulku', () => {
    const items = parseRssItems(FINANCNI_SPRAVA_XML)

    expect(items[1].title).toBe('Vše o EET 2.0 na jednom místě')
    expect(items[1].summary).toBe('Nový web k elektronické evidenci tržeb.')
  })

  it('parsuje oba tvary data — offset s dvojtečkou i GMT', () => {
    expect(parseRssItems(FINANCNI_SPRAVA_XML)[0].publishedAt).toBe('2026-09-02T22:00:00.000Z')
    expect(parseRssItems(CSSZ_XML)[0].publishedAt).toBe('2026-08-21T20:56:00.000Z')
  })

  it('nečitelné datum nechá jako null místo Invalid Date', () => {
    const xml = `<rss><channel><item>
      <title>Bez data</title><link>https://example.cz/a</link><pubDate>kdysi</pubDate>
    </item></channel></rss>`

    expect(parseRssItems(xml)[0].publishedAt).toBeNull()
  })

  it('zahodí položku bez odkazu — link je v tabulce NOT NULL', () => {
    const xml = `<rss><channel>
      <item><title>Bez odkazu</title></item>
      <item><title>S odkazem</title><link>https://example.cz/b</link></item>
    </channel></rss>`

    const items = parseRssItems(xml)
    expect(items).toHaveLength(1)
    expect(items[0].title).toBe('S odkazem')
  })

  it('prázdný nebo rozbitý feed vrátí prázdné pole, nespadne', () => {
    expect(parseRssItems('')).toEqual([])
    expect(parseRssItems('<rss><channel></channel></rss>')).toEqual([])
    expect(parseRssItems('tohle není XML')).toEqual([])
  })
})

describe('matchesTaxKeywords', () => {
  it('pustí dál, co se týká OSVČ a daní', () => {
    const [danove, eet] = parseRssItems(FINANCNI_SPRAVA_XML)

    expect(matchesTaxKeywords(danove)).toBe(true)
    expect(matchesTaxKeywords(eet)).toBe(false)
  })

  it('odfiltruje důchodové zprávy ČSSZ, které s OSVČ nesouvisí', () => {
    const [osvc, duchody] = parseRssItems(CSSZ_XML)

    expect(matchesTaxKeywords(osvc)).toBe(true)
    expect(matchesTaxKeywords(duchody)).toBe(false)
  })

  it('nezáleží na diakritice ani velikosti písmen', () => {
    expect(matchesTaxKeywords({ title: 'Novinky pro OSVC' })).toBe(true)
    expect(matchesTaxKeywords({ title: 'novinky pro osvč' })).toBe(true)
    expect(matchesTaxKeywords({ title: 'PAUŠÁLNÍ REŽIM' })).toBe(true)
  })

  it('hledá i v popisu, nejen v titulku', () => {
    expect(matchesTaxKeywords({ title: 'Neutrální titulek', summary: 'Týká se paušálního režimu.' })).toBe(true)
    expect(matchesTaxKeywords({ title: 'Neutrální titulek', summary: 'O ničem.' })).toBe(false)
  })

  it('chybějící popis nevyhodí výjimku', () => {
    expect(matchesTaxKeywords({ title: 'Něco jiného', summary: null })).toBe(false)
    expect(matchesTaxKeywords({ title: 'Něco jiného' })).toBe(false)
  })
})

describe('TAX_NEWS_FEEDS', () => {
  it('oba kanály Finanční správy sdílí jeden source — překryv řeší unikátní (source, guid)', () => {
    const fs = TAX_NEWS_FEEDS.filter(f => f.source === 'financni_sprava')

    expect(fs).toHaveLength(2)
    expect(new Set(fs.map(f => f.url)).size).toBe(2)
  })

  it('všechny adresy jsou https', () => {
    expect(TAX_NEWS_FEEDS.every(f => f.url.startsWith('https://'))).toBe(true)
  })
})
