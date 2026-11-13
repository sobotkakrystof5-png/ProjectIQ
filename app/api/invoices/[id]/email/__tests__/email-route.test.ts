import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Odeslání vystavené faktury klientovi (AD12).
 *
 * Route sahá ven (pošta) a vyrábí PDF, takže se hlídá hlavně to, kdo ji smí
 * spustit: přihlášení, shodný `Origin` (server actions to mají vestavěné,
 * route handler ne) a strop na počet odeslání. A pak to, co nesmí odejít:
 * stornovaný doklad a archiv cizích PDF.
 */

const loadIssuedMock = vi.fn()
const renderMock = vi.fn()
const sendMock = vi.fn()
const sqlMock = vi.fn()
const limitedMock = vi.fn()
let session: unknown = { user: { email: 'admin@example.cz' } }

vi.mock('next-auth', () => ({ getServerSession: async () => session }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/db', () => ({ sql: (...args: unknown[]) => sqlMock(...args) }))
vi.mock('@/lib/admin/invoice-issue', () => ({ loadIssuedInvoiceForPdf: (...a: unknown[]) => loadIssuedMock(...a) }))
vi.mock('@/lib/invoice-pdf/render', () => ({ renderInvoicePdf: (...a: unknown[]) => renderMock(...a) }))
vi.mock('@/lib/email', () => ({ sendInvoiceEmail: (...a: unknown[]) => sendMock(...a) }))
// Předávací dokument (AD16) — přikládá se jen na zaškrtnutí.
const handoverMock = vi.fn()
const handoverRenderMock = vi.fn()
const adminDbMock = vi.fn()
vi.mock('@/lib/admin/handover', () => ({ loadHandoverForPdf: (...a: unknown[]) => handoverMock(...a) }))
vi.mock('@/lib/invoice-pdf/handover', () => ({ renderHandoverPdf: (...a: unknown[]) => handoverRenderMock(...a) }))
vi.mock('@/lib/admin/db', () => ({ adminDb: (...a: unknown[]) => adminDbMock(...a) }))
vi.mock('@/lib/api-auth', () => ({ getClientIp: () => '1.2.3.4' }))
vi.mock('@/lib/api-rate-limit', () => ({
  isApiRateLimited: (...a: unknown[]) => limitedMock(...a),
  recordApiRequest: async () => {},
}))

import { POST } from '../route'

const ID = '11111111-1111-4111-8111-111111111111'
const params = Promise.resolve({ id: ID })

const invoice = {
  invoice: {
    number: '2026001',
    issuer: { name: 'Kryštof Sobotka' },
    dueOn: '2026-11-26',
    cancelled: false,
  },
  filename: 'faktura-2026001.pdf',
}

const request = (body: unknown, origin: string | null = 'https://admin.test') =>
  ({
    url: 'https://admin.test/api/invoices/' + ID + '/email',
    headers: new Headers(origin ? { origin } : {}),
    json: async () => body,
  }) as unknown as Parameters<typeof POST>[0]

beforeEach(() => {
  session = { user: { email: 'admin@example.cz' } }
  loadIssuedMock.mockReset().mockResolvedValue(invoice)
  renderMock.mockReset().mockResolvedValue(Buffer.from('%PDF-1.4 test'))
  sendMock.mockReset().mockResolvedValue(true)
  sqlMock.mockReset().mockResolvedValue([])
  limitedMock.mockReset().mockResolvedValue(false)
  adminDbMock.mockReset().mockResolvedValue([{ project_id: '22222222-2222-4222-8222-222222222222' }])
  handoverMock.mockReset().mockResolvedValue({
    doc: { summary: 'Hotovo.', items: [], access: [], maintenance: { included: [], excluded: [] }, note: '' },
    projectTitle: 'Web', clientName: 'Jan Novák', issuerName: 'Kryštof Sobotka',
    issuedOn: '2026-11-13', filename: 'predani-web-2026-11-13.pdf',
  })
  handoverRenderMock.mockReset().mockResolvedValue(Buffer.from('%PDF-1.4 predani'))
})

describe('POST /api/invoices/[id]/email', () => {
  it('pošle fakturu s PDF v příloze a zapíše, že odešla', async () => {
    const res = await POST(request({ to: 'klient@example.cz' }), { params })
    expect(res.status).toBe(200)
    const [opts] = sendMock.mock.calls[0] as [{ to: string; subject: string; pdfs: { filename: string }[] }]
    expect(opts.to).toBe('klient@example.cz')
    expect(opts.subject).toBe('Faktura 2026001')
    // Bez zaškrtnutí jde v příloze jen faktura — předávací dokument až na požádání (AD16).
    expect(opts.pdfs.map((pdf) => pdf.filename)).toEqual(['faktura-2026001.pdf'])
    // `sent_at` se zapíše až po úspěšném odeslání
    expect(sqlMock).toHaveBeenCalledTimes(1)
  })

  it('bez přihlášení nic neodešle', async () => {
    session = null
    const res = await POST(request({ to: 'klient@example.cz' }), { params })
    expect(res.status).toBe(401)
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('požadavek z cizí stránky odmítne (CSRF)', async () => {
    const res = await POST(request({ to: 'klient@example.cz' }, 'https://utocnik.example'), { params })
    expect(res.status).toBe(403)
    expect(sendMock).not.toHaveBeenCalled()
    const bezOrigin = await POST(request({ to: 'klient@example.cz' }, null), { params })
    expect(bezOrigin.status).toBe(403)
  })

  it('neplatná adresa neprojde a Chromium se ani nespustí', async () => {
    for (const to of ['nesmysl', '', 'a@b.cz\nbcc: nekdo@jinde.cz']) {
      const res = await POST(request({ to }), { params })
      expect(res.status).toBe(400)
    }
    expect(renderMock).not.toHaveBeenCalled()
  })

  it('archiv cizího PDF ani cizí adresa nejsou k odeslání', async () => {
    loadIssuedMock.mockResolvedValue(null)
    expect((await POST(request({ to: 'klient@example.cz' }), { params })).status).toBe(404)
    expect((await POST(request({ to: 'klient@example.cz' }), { params: Promise.resolve({ id: 'neco' }) })).status).toBe(404)
  })

  it('stornovanou fakturu neodešle', async () => {
    loadIssuedMock.mockResolvedValue({ ...invoice, invoice: { ...invoice.invoice, cancelled: true } })
    const res = await POST(request({ to: 'klient@example.cz' }), { params })
    expect(res.status).toBe(400)
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('při zahlcení vrátí 429 a nic nepošle', async () => {
    limitedMock.mockResolvedValue(true)
    const res = await POST(request({ to: 'klient@example.cz' }), { params })
    expect(res.status).toBe(429)
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('když pošta selže, `sent_at` se nezapíše', async () => {
    sendMock.mockResolvedValue(false)
    const res = await POST(request({ to: 'klient@example.cz' }), { params })
    expect(res.status).toBe(502)
    expect(sqlMock).not.toHaveBeenCalled()
  })

  it('selhání Chromia je 503, ne tichý e-mail bez přílohy', async () => {
    renderMock.mockRejectedValue(new Error('chromium_missing'))
    const res = await POST(request({ to: 'klient@example.cz' }), { params })
    expect(res.status).toBe(503)
    expect(sendMock).not.toHaveBeenCalled()
  })
})

describe('p\u0159ed\u00e1vac\u00ed dokument v p\u0159\u00edloze (AD16)', () => {
  it('p\u0159ilo\u017e\u00ed se, kdy\u017e si o to \u010dlov\u011bk \u0159ekne', async () => {
    const res = await POST(request({ to: 'klient@example.cz', predani: true }), { params })
    expect(res.status).toBe(200)
    const [opts] = sendMock.mock.calls[0] as [{ pdfs: { filename: string }[] }]
    expect(opts.pdfs.map((pdf) => pdf.filename)).toEqual([
      'faktura-2026001.pdf',
      'predani-web-2026-11-13.pdf',
    ])
  })

  it('nevypln\u011bn\u00fd dokument e-mail zastav\u00ed, a\u0165 klient nedostane polovinu', async () => {
    handoverMock.mockResolvedValue(null)
    const res = await POST(request({ to: 'klient@example.cz', predani: true }), { params })
    expect(res.status).toBe(400)
    expect(sendMock).not.toHaveBeenCalled()
  })
})
