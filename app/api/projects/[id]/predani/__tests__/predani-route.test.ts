import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Předávací dokument jako PDF (AD16).
 *
 * Hlídá se, kdo ho smí vyrobit: přihlášení a shodný `Origin` — route
 * zapisuje datum předání, takže je to POST, ne GET (zápis na GET by šel
 * vyvolat obrázkem na cizí stránce).
 */

const loadMock = vi.fn()
const renderMock = vi.fn()
let session: unknown = { user: { email: 'admin@example.cz' } }

vi.mock('next-auth', () => ({ getServerSession: async () => session }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/admin/handover', () => ({ loadHandoverForPdf: (...a: unknown[]) => loadMock(...a) }))
vi.mock('@/lib/invoice-pdf/handover', () => ({ renderHandoverPdf: (...a: unknown[]) => renderMock(...a) }))

import { POST } from '../route'

const ID = '11111111-1111-4111-8111-111111111111'
const params = Promise.resolve({ id: ID })

const data = {
  doc: {
    summary: 'Hotovo.',
    items: [{ label: 'Úvodní stránka', note: '' }],
    access: [],
    maintenance: { included: [], excluded: [] },
    note: '',
  },
  projectTitle: 'Web pro kavárnu',
  clientName: 'Jan Novák',
  issuerName: 'Kryštof Sobotka',
  issuedOn: '2026-11-13',
  filename: 'predani-web-pro-kavarnu-2026-11-13.pdf',
}

const request = (origin: string | null = 'https://admin.test', id: string = ID) =>
  ({
    url: `https://admin.test/api/projects/${id}/predani`,
    headers: new Headers(origin ? { origin } : {}),
  }) as unknown as Parameters<typeof POST>[0]

beforeEach(() => {
  session = { user: { email: 'admin@example.cz' } }
  loadMock.mockReset().mockResolvedValue(data)
  renderMock.mockReset().mockResolvedValue(Buffer.from('%PDF-1.4 test'))
})

describe('POST /api/projects/[id]/predani', () => {
  it('vrátí PDF s názvem souboru', async () => {
    const res = await POST(request(), { params })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/pdf')
    expect(res.headers.get('content-disposition')).toContain('predani-web-pro-kavarnu')
  })

  it('bez přihlášení nic nevyrobí', async () => {
    session = null
    const res = await POST(request(), { params })
    expect(res.status).toBe(401)
    expect(renderMock).not.toHaveBeenCalled()
  })

  it('z cizí stránky neprojde', async () => {
    const res = await POST(request('https://utocnik.example'), { params })
    expect(res.status).toBe(403)
    expect(loadMock).not.toHaveBeenCalled()
  })

  it('nevyplněný dokument vrátí 404 a česky řekne proč', async () => {
    loadMock.mockResolvedValue(null)
    const res = await POST(request(), { params })
    expect(res.status).toBe(404)
    expect(await res.text()).toContain('není vyplněný')
  })

  it('cizí adresa místo id se do databáze vůbec nedostane', async () => {
    const res = await POST(request('https://admin.test', 'sablony'), {
      params: Promise.resolve({ id: 'sablony' }),
    })
    expect(res.status).toBe(404)
    expect(loadMock).not.toHaveBeenCalled()
  })

  it('když se PDF nepovede, řekne to a nespadne', async () => {
    renderMock.mockRejectedValue(new Error('chromium'))
    const res = await POST(request(), { params })
    expect(res.status).toBe(503)
  })
})
