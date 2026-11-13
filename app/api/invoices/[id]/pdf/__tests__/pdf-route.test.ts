import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * AD08: PDF faktury se při každém otevření nestahuje znovu.
 *
 * Odkaz na PDF je v detailu zakázky i v evidenci faktur a dokument může mít
 * megabajty. Route proto posílá `ETag` z `md5(pdf_data)` a při shodě vrací
 * 304 — a hlavně v tom případě **bajty z databáze vůbec nečte**.
 *
 * AD12 přidal druhou cestu: faktura vystavená v adminu uložené PDF nemá,
 * vyrábí se při otevření. ETag tam nese obsah dokladu, takže opakované
 * otevření **nespouští Chromium znovu**.
 */

const batchMock = vi.fn()
const loadIssuedMock = vi.fn()
const renderMock = vi.fn()
let session: unknown = { user: { email: 'admin@example.cz' } }
let issuingReady = true

vi.mock('next-auth', () => ({ getServerSession: async () => session }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/admin/db', () => ({
  adminDb: Object.assign(
    async (strings: TemplateStringsArray, ...values: unknown[]) => batchMock(strings.join('?'), values),
    { batch: vi.fn() },
  ),
}))
vi.mock('@/lib/admin/invoice-issue', () => ({
  isIssuingReady: async () => issuingReady,
  loadIssuedInvoiceForPdf: (...args: unknown[]) => loadIssuedMock(...args),
}))
vi.mock('@/lib/invoice-pdf/render', () => ({
  renderInvoicePdf: (...args: unknown[]) => renderMock(...args),
}))

import { GET } from '../route'

const PDF = Buffer.from('%PDF-1.4 ukázka')
const GENERATED = Buffer.from('%PDF-1.4 vyrobeno')
const ETAG = '"d41d8cd98f00b204e9800998ecf8427e"'
const ISSUED_ETAG = '"5f2b1c0d9e8a7b6c5d4e3f2a1b0c9d8e"'

const params = Promise.resolve({ id: '11111111-1111-4111-8111-111111111111' })
const request = (headers: Record<string, string> = {}) =>
  ({ headers: new Headers(headers), url: 'https://admin.test/api/invoices/x/pdf' }) as Parameters<typeof GET>[0]

function queue({ meta = true, data = true } = {}) {
  const queries: string[] = []
  batchMock.mockImplementation(async (text: string) => {
    queries.push(text)
    if (text.includes('md5(pdf_data)')) {
      return meta
        ? [{
            etag: 'd41d8cd98f00b204e9800998ecf8427e',
            pdf_filename: 'Faktura říjen.pdf',
            invoice_number: '2026-000001',
            number_seq: null,
            issued_etag: '5f2b1c0d9e8a7b6c5d4e3f2a1b0c9d8e',
          }]
        : []
    }
    return data ? [{ pdf_base64: PDF.toString('base64') }] : []
  })
  return queries
}

/** Faktura vystavená v adminu: `pdf_data` prázdné, číslo z řady (AD12). */
function queueIssued({ found = true } = {}) {
  const queries: string[] = []
  batchMock.mockImplementation(async (text: string) => {
    queries.push(text)
    return [{
      etag: null,
      pdf_filename: null,
      invoice_number: '2026001',
      number_seq: 2026001,
      issued_etag: '5f2b1c0d9e8a7b6c5d4e3f2a1b0c9d8e',
    }]
  })
  loadIssuedMock.mockResolvedValue(
    found ? { invoice: { number: '2026001', issuer: { name: 'Dodavatel' } }, filename: 'faktura-2026001.pdf' } : null,
  )
  renderMock.mockResolvedValue(GENERATED)
  return queries
}

beforeEach(() => {
  batchMock.mockReset()
  loadIssuedMock.mockReset()
  renderMock.mockReset()
  session = { user: { email: 'admin@example.cz' } }
  issuingReady = true
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

describe('Faktura vystavená v adminu (AD12)', () => {
  it('PDF se vyrobí a ETag nese obsah dokladu', async () => {
    const queries = queueIssued()
    const res = await GET(request(), { params })
    expect(res.status).toBe(200)
    expect(res.headers.get('etag')).toBe(ISSUED_ETAG)
    expect(res.headers.get('content-disposition')).toContain('faktura-2026001.pdf')
    expect(Buffer.from(await res.arrayBuffer()).equals(GENERATED)).toBe(true)
    expect(renderMock).toHaveBeenCalledTimes(1)
    // Bajty z `pdf_data` se netahají — žádné uložené PDF neexistuje.
    expect(queries.join(' ')).not.toContain('encode(pdf_data')
  })

  it('podruhé vrátí 304 a Chromium se vůbec nespustí', async () => {
    queueIssued()
    const res = await GET(request({ 'if-none-match': ISSUED_ETAG }), { params })
    expect(res.status).toBe(304)
    expect(renderMock).not.toHaveBeenCalled()
    expect(loadIssuedMock).not.toHaveBeenCalled()
  })

  it('selhání Chromia je 503, ne prázdné PDF', async () => {
    queueIssued()
    renderMock.mockRejectedValue(new Error('chromium_missing'))
    const res = await GET(request(), { params })
    expect(res.status).toBe(503)
  })

  it('smazaná mezi dotazy je 404', async () => {
    queueIssued({ found: false })
    expect((await GET(request(), { params })).status).toBe(404)
    expect(renderMock).not.toHaveBeenCalled()
  })

  it('bez migrace 107 se route chová jako dřív: jen uložená PDF', async () => {
    issuingReady = false
    const queries = queue()
    const res = await GET(request(), { params })
    expect(res.status).toBe(200)
    // Starý dotaz si sám filtruje `pdf_data IS NOT NULL` a o nových sloupcích neví.
    expect(queries[0]).toContain('pdf_data IS NOT NULL')
    expect(queries[0]).not.toContain('cancelled_at')
  })
})
