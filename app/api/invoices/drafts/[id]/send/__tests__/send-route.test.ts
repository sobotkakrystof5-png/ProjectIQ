import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * „Schválit a poslat" u konceptu faktury (R-117).
 *
 * Route vystaví fakturu (číslo z řady) a pak ji pošle. Hlídá se, kdo ji smí
 * spustit (přihlášení, shodný `Origin`, strop), a co se stane, když něco
 * selže: neodeslaná faktura se už nevystavuje znovu, odpověď vede do detailu.
 * Zámek konceptu proti dvojímu vystavení v databázi testuje
 * `lib/__tests__/admin-faktury-koncepty.test.ts`; tady jen to, že route
 * jeho odmítnutí předá dál a nic nepošle.
 */

const issueMock = vi.fn()
const sendMock = vi.fn()
const limitedMock = vi.fn()
let session: unknown = { email: 'admin@example.cz' }

vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('@/lib/auth', () => ({ getAdminSession: async () => session }))
vi.mock('@/lib/api-auth', () => ({ getClientIp: () => '1.2.3.4' }))
vi.mock('@/lib/api-rate-limit', () => ({
  isApiRateLimited: (...a: unknown[]) => limitedMock(...a),
  recordApiRequest: async () => {},
}))
vi.mock('@/lib/admin/invoice-drafts', () => ({ issueDraft: (...a: unknown[]) => issueMock(...a) }))
vi.mock('@/lib/admin/invoice-send', () => ({ sendIssuedInvoice: (...a: unknown[]) => sendMock(...a) }))

import { POST } from '../route'

const ID = '11111111-1111-4111-8111-111111111111'
const INVOICE = '33333333-3333-4333-8333-333333333333'
const params = Promise.resolve({ id: ID })

const request = (body: unknown, origin: string | null = 'https://admin.test') =>
  ({
    url: `https://admin.test/api/invoices/drafts/${ID}/send`,
    headers: new Headers(origin ? { origin } : {}),
    json: async () => body,
  }) as unknown as Parameters<typeof POST>[0]

beforeEach(() => {
  session = { email: 'admin@example.cz' }
  issueMock.mockReset().mockResolvedValue({ ok: true, invoiceId: INVOICE, number: '2026007' })
  sendMock.mockReset().mockResolvedValue({ ok: true })
  limitedMock.mockReset().mockResolvedValue(false)
})

describe('POST /api/invoices/drafts/[id]/send', () => {
  it('vystaví koncept a pošle ho na zadanou adresu', async () => {
    const res = await POST(request({ to: 'klient@example.cz' }), { params })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, number: '2026007', invoiceHref: `/dashboard/faktury/${INVOICE}` })
    expect(issueMock).toHaveBeenCalledWith(ID, 'klient@example.cz')
    expect(sendMock).toHaveBeenCalledWith(INVOICE, { to: 'klient@example.cz' })
  })

  it('bez přihlášení nic nevystaví', async () => {
    session = null
    const res = await POST(request({ to: 'klient@example.cz' }), { params })
    expect(res.status).toBe(401)
    expect(issueMock).not.toHaveBeenCalled()
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('požadavek z cizí stránky nebo bez Origin odmítne (CSRF)', async () => {
    for (const origin of ['https://utocnik.example', null]) {
      const res = await POST(request({ to: 'klient@example.cz' }, origin), { params })
      expect(res.status).toBe(403)
    }
    expect(issueMock).not.toHaveBeenCalled()
  })

  it('nesmyslné id ani neplatná adresa se k vystavení nedostanou', async () => {
    const bad = await POST(request({ to: 'klient@example.cz' }), { params: Promise.resolve({ id: 'nesmysl' }) })
    expect(bad.status).toBe(404)
    for (const to of ['nesmysl', '', 'a@b.cz\nbcc: nekdo@jinde.cz']) {
      const res = await POST(request({ to }), { params })
      expect(res.status).toBe(400)
    }
    expect(issueMock).not.toHaveBeenCalled()
  })

  it('nad stropem pokusů nevystaví nic', async () => {
    limitedMock.mockResolvedValue(true)
    const res = await POST(request({ to: 'klient@example.cz' }), { params })
    expect(res.status).toBe(429)
    expect(issueMock).not.toHaveBeenCalled()
  })

  it('když e-mail neodejde, faktura zůstane vystavená jednou a odpověď vede do detailu', async () => {
    sendMock.mockResolvedValue({ ok: false, error: 'Resend neodpovídá' })
    const res = await POST(request({ to: 'klient@example.cz' }), { params })
    expect(res.status).toBe(502)
    const body = await res.json()
    expect(body.invoiceHref).toBe(`/dashboard/faktury/${INVOICE}`)
    expect(body.error).toContain('2026007 je vystavená')
    expect(body.error).toContain('z detailu faktury')
    expect(issueMock).toHaveBeenCalledTimes(1)
  })

  it('druhé kliknutí na vyřízený koncept nevystaví ani nepošle nic', async () => {
    expect((await POST(request({ to: 'klient@example.cz' }), { params })).status).toBe(200)
    issueMock.mockResolvedValue({ ok: false, error: 'Tenhle koncept už je vyřízený.', status: 409 })
    const again = await POST(request({ to: 'klient@example.cz' }), { params })
    expect(again.status).toBe(409)
    expect(sendMock).toHaveBeenCalledTimes(1)
  })

  it('koncept s chybějícím údajem vrátí odkaz na úpravu a nic nepošle', async () => {
    issueMock.mockResolvedValue({ ok: false, error: 'V konceptu chybí cena.', status: 400, editHref: `/dashboard/faktury/nova?koncept=${ID}` })
    const res = await POST(request({ to: 'klient@example.cz' }), { params })
    expect(res.status).toBe(400)
    expect((await res.json()).editHref).toBe(`/dashboard/faktury/nova?koncept=${ID}`)
    expect(sendMock).not.toHaveBeenCalled()
  })
})
