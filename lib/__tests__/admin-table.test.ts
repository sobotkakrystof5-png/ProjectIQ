import { describe, expect, it } from 'vitest'
import { flipDir, pageCount, parseTableParams, rangeLabel, tableHref, tableLinks } from '@/lib/admin-table'

/**
 * Řazení a stránkování sdílené tabulky adminu (AD07).
 *
 * Nejdůležitější je první blok: `ORDER BY` se nedá parametrizovat, takže
 * jediná pojistka je, že se klíč z adresy **vybírá** ze seznamu a nikdy
 * se do SQL nevkládá.
 */

const ALLOWED = {
  datum: { sql: 'completed_at', dir: 'desc' as const },
  nazev: { sql: 'title', dir: 'asc' as const },
  castka: { sql: 'amount', dir: 'desc' as const },
}

const parse = (params: Record<string, string | string[] | undefined>, extra = {}) =>
  parseTableParams(params, { allowed: ALLOWED, defaultSort: 'datum', pageSize: 50, ...extra })

describe('parseTableParams — vstup z adresy do SQL nepropadne', () => {
  it('neznámý sloupec spadne na výchozí řazení', () => {
    const params = parse({ sort: 'neexistuje' })
    expect(params.sortKey).toBe('datum')
    expect(params.orderBy).toBe('ORDER BY completed_at DESC NULLS LAST')
  })

  it('pokus o vložení SQL se do dotazu nedostane', () => {
    const params = parse({ sort: "amount; DROP TABLE invoices --", dir: 'desc; DELETE FROM costs' })
    expect(params.orderBy).toBe('ORDER BY completed_at DESC NULLS LAST')
    expect(params.orderBy).not.toContain('DROP')
    expect(params.orderBy).not.toContain('DELETE')
  })

  it('do ORDER BY jdou jen výrazy ze seznamu', () => {
    for (const [key, column] of Object.entries(ALLOWED)) {
      expect(parse({ sort: key }).orderBy).toContain(column.sql)
    }
  })

  it('vlastnost prototypu není povolený sloupec', () => {
    expect(parse({ sort: 'constructor' }).sortKey).toBe('datum')
    expect(parse({ sort: 'toString' }).orderBy).toBe('ORDER BY completed_at DESC NULLS LAST')
  })
})

describe('parseTableParams — směr, stránka a dorovnání pořadí', () => {
  it('bez směru v adrese platí výchozí směr sloupce', () => {
    expect(parse({ sort: 'nazev' }).dir).toBe('asc')
    expect(parse({ sort: 'castka' }).dir).toBe('desc')
  })

  it('nesmyslný směr se ignoruje, platný se použije', () => {
    expect(parse({ sort: 'nazev', dir: 'vzhuru' }).dir).toBe('asc')
    expect(parse({ sort: 'nazev', dir: 'desc' }).dir).toBe('desc')
  })

  it('prázdné hodnoty jsou vždy na konci, ať se řadí jakkoli', () => {
    expect(parse({ sort: 'castka', dir: 'asc' }).orderBy).toContain('NULLS LAST')
    expect(parse({ sort: 'castka', dir: 'desc' }).orderBy).toContain('NULLS LAST')
  })

  it('stránka se počítá od jedné a nejde ji přetočit do záporu', () => {
    expect(parse({ page: '3' })).toMatchObject({ page: 3, offset: 100, limit: 50 })
    expect(parse({ page: '0' }).page).toBe(1)
    expect(parse({ page: '-5' }).page).toBe(1)
    expect(parse({ page: 'nesmysl' }).page).toBe(1)
    expect(parse({ page: '999999' }).page).toBeLessThanOrEqual(1000)
  })

  it('dorovnání pořadí drží řádky mezi stránkami na svém místě', () => {
    expect(parse({ sort: 'nazev' }, { tiebreak: 'created_at' }).orderBy).toBe(
      'ORDER BY title ASC NULLS LAST, created_at DESC',
    )
  })

  it('předpona oddělí dvě tabulky na jedné obrazovce', () => {
    const params = parseTableParams(
      { sort: 'nazev', w_sort: 'castka', w_page: '2' },
      { allowed: ALLOWED, defaultSort: 'datum', pageSize: 10, prefix: 'w' },
    )
    expect(params.sortKey).toBe('castka')
    expect(params.page).toBe(2)
  })

  it('bere první hodnotu, když je parametr v adrese dvakrát', () => {
    expect(parse({ sort: ['nazev', 'castka'] }).sortKey).toBe('nazev')
  })
})

describe('odkazy tabulky', () => {
  const links = tableLinks('/dashboard/dokoncene', { typ: 'personal', page: '4' })

  it('řazení zachová ostatní filtry a vrátí se na první stránku', () => {
    const href = links.sortHref('nazev', 'asc')
    expect(href).toContain('typ=personal')
    expect(href).toContain('sort=nazev')
    expect(href).toContain('dir=asc')
    expect(href).not.toContain('page=')
  })

  it('první stránka se do adresy nepíše', () => {
    expect(links.pageHref(1)).toBe('/dashboard/dokoncene?typ=personal')
    expect(links.pageHref(2)).toContain('page=2')
  })

  it('prázdná hodnota parametr odstraní', () => {
    expect(tableHref('/dashboard/faktury', { stav: 'zaplacene' }, { stav: null })).toBe('/dashboard/faktury')
  })
})

describe('popisky', () => {
  it('řekne, co je vidět a kolik toho je', () => {
    const params = parse({ page: '2' })
    expect(rangeLabel(params, 50, 237)).toBe('51–100 z 237')
    expect(rangeLabel(parse({}), 12, 12)).toBe('12')
    expect(rangeLabel(parse({}), 0, 0)).toBe('0')
  })

  it('počet stránek je aspoň jedna', () => {
    expect(pageCount(0, 50)).toBe(1)
    expect(pageCount(51, 50)).toBe(2)
  })

  it('kliknutí na seřazený sloupec otočí směr', () => {
    expect(flipDir('asc')).toBe('desc')
    expect(flipDir('desc')).toBe('asc')
  })
})
