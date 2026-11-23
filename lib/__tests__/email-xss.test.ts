import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Cizí text (jméno z formuláře, odpověď klienta) končí v HTML e-mailu. Test hlídá, že
// z něj nevznikne značka ani atribut a že odkaz dostane jen http(s) adresa.
const sendMail = vi.fn()
vi.mock('nodemailer', () => ({ default: { createTransport: () => ({ sendMail }) }, createTransport: () => ({ sendMail }) }))

import { sendBrandedEmail, sendPlainEmail } from '@/lib/email'

describe('lib/email — HTML z cizího textu', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.stubEnv('VIZEON_RESEND_API_KEY', 're_test')
    fetchMock.mockReset().mockResolvedValue(new Response(JSON.stringify({ id: 'e_1' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  const sentHtml = (): string => JSON.parse(fetchMock.mock.calls[0][1].body).html as string

  it('značky v textu se escapují a nevzniká žádná nová', async () => {
    await sendPlainEmail({ to: 'a@example.cz', subject: 'x', text: 'Ahoj <img src=x onerror=alert(1)> <script>alert(1)</script>' })
    const html = sentHtml()
    expect(html).not.toContain('<img')
    expect(html).not.toContain('<script')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })

  it('uvozovka v adrese neukončí atribut href a nevloží další atribut', async () => {
    await sendPlainEmail({ to: 'a@example.cz', subject: 'x', text: 'Koukněte: https://a.cz/"onmouseover="alert(1) díky' })
    const html = sentHtml()
    expect(html).not.toMatch(/<a [^>]*onmouseover/i)
    // Odkaz končí před uvozovkou, zbytek je prostý text s escapovanou uvozovkou.
    expect(html).toContain('<a href="https://a.cz/" style="color:#1b3868;">https://a.cz/</a>&quot;onmouseover=&quot;alert(1)')
  })

  it('odkaz vznikne jen z http(s) adresy', async () => {
    await sendPlainEmail({ to: 'a@example.cz', subject: 'x', text: 'javascript:alert(1) a https://vizeon.cz/ukazka.' })
    const html = sentHtml()
    expect(html).not.toMatch(/href="javascript/i)
    expect(html).toContain('<a href="https://vizeon.cz/ukazka" style="color:#1b3868;">https://vizeon.cz/ukazka</a>.')
  })

  it('tlačítko s cizím schématem se z e-mailu vynechá, https zůstane escapované', async () => {
    await sendBrandedEmail({
      to: 'a@example.cz',
      subject: 'x',
      heading: 'H',
      intro: 'I',
      fields: [{ label: 'Jméno', value: '"><script>alert(1)</script>' }],
      ctas: [
        { label: 'Zlé', href: 'javascript:alert(1)' },
        { label: 'Dobré', href: 'https://www.zakaziq.cz/p/abc?x=1&y=2' },
      ],
    })
    const html = sentHtml()
    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('<script')
    expect(html).toContain('href="https://www.zakaziq.cz/p/abc?x=1&amp;y=2"')
  })
})
