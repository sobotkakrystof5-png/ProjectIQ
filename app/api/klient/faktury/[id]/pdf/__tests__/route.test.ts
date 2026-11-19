import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// Trasa PDF faktury pro klienta (KP13): přihlášení, 404 pro cizí doklad,
// 304 bez limitu a bez čtení bajtů, limit na člena.

const ctx = { userId: 'u', clientId: 'aaaaaaaa-0000-4000-8000-000000000001', memberId: 'aaaaaaaa-0000-4000-8000-000000000a01', role: 'member', clientName: 'A' }
const ID = 'aaaaaaaa-0000-4000-8000-0000000000f1'

const mocks = vi.hoisted(() => ({
  getPortalContext: vi.fn(),
  loadClientInvoiceDoc: vi.fn(),
  loadArchivedInvoicePdf: vi.fn(),
  isApiRateLimited: vi.fn(),
  recordApiRequest: vi.fn(),
  renderInvoicePdf: vi.fn(),
}))

vi.mock('@/lib/portal/context', () => ({ getPortalContext: mocks.getPortalContext }))
vi.mock('@/lib/portal/money', () => ({
  loadClientInvoiceDoc: mocks.loadClientInvoiceDoc,
  loadArchivedInvoicePdf: mocks.loadArchivedInvoicePdf,
}))
vi.mock('@/lib/api-rate-limit', () => ({ isApiRateLimited: mocks.isApiRateLimited, recordApiRequest: mocks.recordApiRequest }))
vi.mock('@/lib/invoice-pdf/render', () => ({ renderInvoicePdf: mocks.renderInvoicePdf }))

import { GET } from '../route'

const call = (id: string, headers: Record<string, string> = {}) =>
  GET(new NextRequest(`http://localhost/api/klient/faktury/${id}/pdf`, { headers }), { params: Promise.resolve({ id }) })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getPortalContext.mockResolvedValue(ctx)
  mocks.isApiRateLimited.mockResolvedValue(false)
})

describe('GET /api/klient/faktury/[id]/pdf', () => {
  it('bez přihlášení 401 a do databáze nejde', async () => {
    mocks.getPortalContext.mockResolvedValue(null)
    expect((await call(ID)).status).toBe(401)
    expect(mocks.loadClientInvoiceDoc).not.toHaveBeenCalled()
  })

  it('nesmyslné id i cizí faktura jsou 404', async () => {
    expect((await call('nesmysl')).status).toBe(404)
    mocks.loadClientInvoiceDoc.mockResolvedValue(null)
    expect((await call(ID)).status).toBe(404)
    expect(mocks.loadClientInvoiceDoc).toHaveBeenCalledWith(ctx.clientId, ID)
  })

  it('stejný ETag = 304 bez limitu a bez bajtů', async () => {
    mocks.loadClientInvoiceDoc.mockResolvedValue({ kind: 'archived', number: 'FV/1', etag: 'a-abc' })
    const res = await call(ID, { 'if-none-match': 'W/"a-abc"' })
    expect(res.status).toBe(304)
    expect(mocks.isApiRateLimited).not.toHaveBeenCalled()
    expect(mocks.loadArchivedInvoicePdf).not.toHaveBeenCalled()
  })

  it('archivní PDF jen přes funkci s členem z přihlášení, název z čísla', async () => {
    mocks.loadClientInvoiceDoc.mockResolvedValue({ kind: 'archived', number: 'FV/2025/118', etag: 'a-abc' })
    mocks.loadArchivedInvoicePdf.mockResolvedValue(Buffer.from('%PDF-1.4'))
    const res = await call(ID)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/pdf')
    expect(res.headers.get('content-disposition')).toContain('faktura-FV2025118.pdf')
    expect(res.headers.get('cache-control')).toBe('private, max-age=0, must-revalidate')
    expect(mocks.loadArchivedInvoicePdf).toHaveBeenCalledWith(ctx.clientId, ctx.memberId, ID)
  })

  it('přes limit 429 a Chromium se nespustí', async () => {
    mocks.loadClientInvoiceDoc.mockResolvedValue({ kind: 'issued', number: '2026001', etag: 'i-x', invoice: {} })
    mocks.isApiRateLimited.mockResolvedValue(true)
    expect((await call(ID)).status).toBe(429)
    expect(mocks.renderInvoicePdf).not.toHaveBeenCalled()
  })

  it('vystavená faktura se vyrobí z projekce', async () => {
    const invoice = { issuer: { name: 'Dodavatel' } }
    mocks.loadClientInvoiceDoc.mockResolvedValue({ kind: 'issued', number: '2026001', etag: 'i-x', invoice })
    mocks.renderInvoicePdf.mockResolvedValue(Buffer.from('%PDF'))
    const res = await call(ID)
    expect(res.status).toBe(200)
    expect(res.headers.get('etag')).toBe('"i-x"')
    expect(mocks.renderInvoicePdf).toHaveBeenCalledWith(invoice, { name: 'Dodavatel', logo: null })
  })
})
