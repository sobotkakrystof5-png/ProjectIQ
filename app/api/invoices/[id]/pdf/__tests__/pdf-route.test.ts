import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * AD08: PDF faktury se při každém otevření nestahuje znovu.
 *
 * Odkaz na PDF je v detailu zakázky i v evidenci faktur a dokument může mít
 * megabajty. Route proto posílá `ETag` z `md5(pdf_data)` a při shodě vrací
 * 304 — a hlavně v tom případě **bajty z databáze vůbec nečte**.
 */

const batchMock = vi.fn()
let session: unknown = { user: { email: 'admin@example.cz' } }

vi.mock('next-auth', () => ({ getServerSession: async () => session }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/admin/db', () => ({
  adminDb: Object.assign(
    async (strings: TemplateStringsArray, ...values: unknown[]) => batchMock(strings.join('?'), values),
    { batch: vi.fn() },
  ),
}))

import { GET } from '../route'

const PDF = Buffer.from('%PDF-1.4 ukázka')
const ETAG = '"d41d8cd98f00b204e9800998ecf8427e"'

const params = Promise.resolve({ id: '11111111-1111-4111-8111-111111111111' })
const request = (headers: Record<string, string> = {}) =>
  ({ headers: new Headers(headers) }) as Parameters<typeof GET>[0]

function queue({ meta = true, data = true } = {}) {
  const queries: string[] = []
  batchMock.mockImplementation(async (text: string) => {
    queries.push(text)
    if (text.includes('md5(pdf_data)')) {
      return meta
        ? [{ etag: 'd41d8cd98f00b204e9800998ecf8427e', size: PDF.byteLength, pdf_filename: 'Faktura říjen.pdf', invoice_number: '2026-000001' }]
        : []
    }
    return data ? [{ pdf_base64: PDF.toString('base64') }] : []
  })
  return queries
}

beforeEach(() => {
  batchMock.mockReset()
  session = { user: { email: 'admin@example.cz' } }
})

describe('PDF faktury', () => {
  it('bez přihlášení 401 a bez jediného dotazu', async () => {
    session = null
    const queries = queue()
    const res = await GET(request(), { params })
    expect(res.status).toBe(401)
    expect(queries).toEqual([])
  })

  it('poprvé pošle dokument s ETagem a názvem souboru', async () => {
    queue()
    const res = await GET(request(), { params })
    expect(res.status).toBe(200)
    expect(res.headers.get('etag')).toBe(ETAG)
    expect(res.headers.get('cache-control')).toBe('private, max-age=0, must-revalidate')
    expect(res.headers.get('content-type')).toBe('application/pdf')
    // Diakritika v názvu přes filename*
    expect(res.headers.get('content-disposition')).toContain("filename*=UTF-8''Faktura%20%C5%99%C3%ADjen.pdf")
    expect(Buffer.from(await res.arrayBuffer()).equals(PDF)).toBe(true)
  })

  it('podruhé vrátí 304 a bajty z databáze nečte', async () => {
    const queries = queue()
    const res = await GET(request({ 'if-none-match': ETAG }), { params })
    expect(res.status).toBe(304)
    expect(await res.text()).toBe('')
    expect(queries).toHaveLength(1)
    expect(queries[0]).toContain('md5(pdf_data)')
    expect(queries.join(' ')).not.toContain("encode(pdf_data")
  })

  it('zná `W/` i víc značek v If-None-Match', async () => {
    queue()
    expect((await GET(request({ 'if-none-match': `W/${ETAG}` }), { params })).status).toBe(304)
    queue()
    expect((await GET(request({ 'if-none-match': `"jina", ${ETAG}` }), { params })).status).toBe(304)
    queue()
    expect((await GET(request({ 'if-none-match': '*' }), { params })).status).toBe(304)
  })

  it('jiný ETag znamená nové stažení', async () => {
    const queries = queue()
    const res = await GET(request({ 'if-none-match': '"stare"' }), { params })
    expect(res.status).toBe(200)
    expect(queries).toHaveLength(2)
  })

  it('adresa, která není UUID, je 404 a do databáze se nejde', async () => {
    const queries = queue()
    const res = await GET(request(), { params: Promise.resolve({ id: 'neco-jineho' }) })
    expect(res.status).toBe(404)
    expect(queries).toEqual([])
  })

  it('faktura bez PDF je 404', async () => {
    queue({ meta: false })
    expect((await GET(request(), { params })).status).toBe(404)
  })

  it('smazaná mezi dotazy je taky 404, ne prázdné PDF', async () => {
    queue({ data: false })
    expect((await GET(request(), { params })).status).toBe(404)
  })
})
