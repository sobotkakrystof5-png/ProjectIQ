import { describe, it, expect, beforeEach } from 'vitest'
import { sendBrandedEmail } from '../email'

describe('sendBrandedEmail', () => {
  beforeEach(() => {
    delete process.env.GMAIL_USER
    delete process.env.GMAIL_APP_PASSWORD
  })

  it('returns false without sending when Gmail credentials are missing', async () => {
    const result = await sendBrandedEmail({
      to: 'klient@example.com',
      subject: 'Test',
      heading: 'Test',
      intro: 'Test',
      fields: [{ label: 'Stav', value: 'Nová' }],
    })
    expect(result).toBe(false)
  })
})
