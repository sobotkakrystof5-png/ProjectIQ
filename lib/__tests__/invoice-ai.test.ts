import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { extractInvoiceFromPdf, isInvoiceAiConfigured } from '@/lib/invoice-ai'

/**
 * Chování bez klíče k API. Plán fáze to má jako tvrdou podmínku: vypnutá AI
 * nesmí rozbít ruční zadání faktury — přepis je nabídka, ne krok navíc.
 *
 * Testy nikdy nesahají na síť: bez klíče se funkce k API vůbec nedostane.
 */
describe('AI přepis bez nakonfigurovaného klíče', () => {
  const saved = {
    key: process.env.ANTHROPIC_API_KEY,
    token: process.env.ANTHROPIC_AUTH_TOKEN,
  }

  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY
    delete process.env.ANTHROPIC_AUTH_TOKEN
  })

  afterEach(() => {
    if (saved.key !== undefined) process.env.ANTHROPIC_API_KEY = saved.key
    if (saved.token !== undefined) process.env.ANTHROPIC_AUTH_TOKEN = saved.token
  })

  it('hlásí, že přepis není k dispozici', () => {
    expect(isInvoiceAiConfigured()).toBe(false)
  })

  it('vrátí chybu místo výjimky, aby formulář zůstal použitelný', async () => {
    const result = await extractInvoiceFromPdf('JVBERi0=')

    expect(result.data).toBeUndefined()
    expect(result.error).toContain('ručně')
  })

  it('stačí ANTHROPIC_AUTH_TOKEN, klíč není jediná cesta', () => {
    process.env.ANTHROPIC_AUTH_TOKEN = 'token'
    expect(isInvoiceAiConfigured()).toBe(true)
  })
})
