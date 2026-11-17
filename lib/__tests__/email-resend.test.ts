import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// R-116: s VIZEON_RESEND_API_KEY jde pošta z lib/email.ts přes Resend, ne přes Gmail.
const sendMail = vi.fn()
vi.mock('nodemailer', () => ({ default: { createTransport: () => ({ sendMail }) }, createTransport: () => ({ sendMail }) }))

import { sendInvoiceEmail, sendPlainEmail } from '@/lib/email'

describe('lib/email přes Resend (R-116)', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.stubEnv('VIZEON_RESEND_API_KEY', 're_test')
    vi.stubEnv('GMAIL_USER', 'x@example.com')
    vi.stubEnv('GMAIL_APP_PASSWORD', 'heslo')
    fetchMock.mockReset().mockResolvedValue(new Response(JSON.stringify({ id: 'e_1' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    sendMail.mockReset()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('obyčejný e-mail odejde přes Resend z vizeon.cz a Gmail se nevolá', async () => {
    const ok = await sendPlainEmail({ to: 'klient@example.cz', subject: 'Ukázky', text: 'Dobrý den' })
    expect(ok).toBe(true)
    expect(sendMail).not.toHaveBeenCalled()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.resend.com/emails')
    const body = JSON.parse(init.body)
    expect(body.from).toMatch(/@vizeon\.cz>$/)
    expect(body.to).toEqual(['klient@example.cz'])
    expect(body.text).toBe('Dobrý den')
  })

  it('faktura nese PDF jako base64 přílohu', async () => {
    await sendInvoiceEmail({ to: 'k@example.cz', subject: 'Faktura', text: 'Posílám', pdfs: [{ filename: 'f.pdf', content: Buffer.from('PDF') }] })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.attachments).toEqual([{ filename: 'f.pdf', content: Buffer.from('PDF').toString('base64'), content_type: 'application/pdf' }])
  })

  it('chyba Resendu vrátí false', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ message: 'nope' }), { status: 403 }))
    expect(await sendPlainEmail({ to: 'k@example.cz', subject: 'A', text: 'B' })).toBe(false)
  })

  it('bez klíče zůstává záložní Gmail', async () => {
    vi.stubEnv('VIZEON_RESEND_API_KEY', '')
    sendMail.mockResolvedValue({})
    expect(await sendPlainEmail({ to: 'k@example.cz', subject: 'A', text: 'B' })).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(sendMail).toHaveBeenCalledOnce()
  })
})
