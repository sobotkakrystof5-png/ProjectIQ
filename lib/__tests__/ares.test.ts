import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAresCache, isValidIco, lookupIco } from '@/lib/ares'

/**
 * Odběratel podle IČO z ARES (AD12, R-086).
 *
 * Hlídá se hlavně to, co je v rozhodnutí slíbené: překlep do sítě vůbec
 * neodejde, odpověď projde Zodem, selhání nikdy nespadne na uživatele
 * a stejné IČO se podruhé neptá.
 *
 * Skutečný požadavek do ARES tady neběží — endpoint byl ověřen živě
 * 2026-11-12, test hlídá chování kolem něj.
 */

const ORIGINAL_FETCH = globalThis.fetch

function mockFetch(impl: (url: string) => Promise<Response> | Response) {
  const spy = vi.fn((url: string | URL) => Promise.resolve(impl(String(url))))
  globalThis.fetch = spy as unknown as typeof fetch
  return spy
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const SUBJECT = {
  ico: '27074358',
  obchodniJmeno: 'Asseco Central Europe, a.s.',
  dic: 'CZ27074358',
  sidlo: { textovaAdresa: 'Budějovická 778/3a, Michle, 14000 Praha 4' },
}

beforeEach(() => {
  clearAresCache()
})

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH
  vi.restoreAllMocks()
})

describe('kontrolní číslice IČO', () => {
  it('pozná platná IČO', () => {
    for (const ico of ['27074358', '29977231', '00006947']) expect(isValidIco(ico)).toBe(true)
  })

  it('odmítne překlep, krátké číslo i text', () => {
    for (const ico of ['27074359', '2707435', '123456789', 'abcdefgh', '']) expect(isValidIco(ico)).toBe(false)
  })
})

describe('dotaz do rejstříku', () => {
  it('vrátí jméno, adresu a DIČ', async () => {
    const fetchSpy = mockFetch(() => json(SUBJECT))
    const result = await lookupIco('27074358')
    expect(result).toEqual({
      status: 'ok',
      subject: {
        ico: '27074358',
        name: 'Asseco Central Europe, a.s.',
        address: 'Budějovická 778/3a, Michle, 14000 Praha 4',
        dic: 'CZ27074358',
      },
    })
    const [url, options] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/27074358')
    expect(options.redirect).toBe('error')
  })

  it('neplatné IČO se do sítě vůbec nepošle', async () => {
    const fetchSpy = mockFetch(() => json(SUBJECT))
    expect(await lookupIco('27074359')).toEqual({ status: 'invalid' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('mezery v IČO nevadí', async () => {
    mockFetch(() => json(SUBJECT))
    expect((await lookupIco(' 270 743 58 ')).status).toBe('ok')
  })

  it('neznámé IČO je „nenašel jsem", ne chyba', async () => {
    mockFetch(() => json({ kod: 'NENALEZENO' }, 404))
    expect(await lookupIco('29977231')).toEqual({ status: 'not_found' })
  })

  it('odpověď bez jména je taky „nenašel jsem"', async () => {
    mockFetch(() => json({ ico: '29977231' }))
    expect((await lookupIco('29977231')).status).toBe('not_found')
  })

  it('výpadek, timeout ani nesmysl místo JSONu nespadne', async () => {
    mockFetch(() => {
      throw new Error('ETIMEDOUT')
    })
    expect((await lookupIco('27074358')).status).toBe('unavailable')

    clearAresCache()
    mockFetch(() => new Response('<html>chyba</html>', { status: 200 }))
    expect((await lookupIco('27074358')).status).toBe('unavailable')

    clearAresCache()
    mockFetch(() => json({}, 500))
    expect((await lookupIco('27074358')).status).toBe('unavailable')
  })

  it('stejné IČO se podruhé neptá, nedostupnost se ale nepamatuje', async () => {
    const ok = mockFetch(() => json(SUBJECT))
    await lookupIco('27074358')
    await lookupIco('27074358')
    expect(ok).toHaveBeenCalledTimes(1)

    clearAresCache()
    const down = mockFetch(() => {
      throw new Error('ECONNRESET')
    })
    await lookupIco('27074358')
    await lookupIco('27074358')
    expect(down).toHaveBeenCalledTimes(2)
  })
})
