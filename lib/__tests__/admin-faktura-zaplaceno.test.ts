import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * AD08: „Zaplaceno" jedním kliknutím ve výpisu faktur.
 *
 * Akce **nepřidává peněžní logiku** — nastaví `paid_on` a pustí tutéž
 * `syncInvoiceTransaction`, kterou volá i formulář. Test proto hlídá hlavně
 * to, že se ta funkce opravdu zavolá (bez ní by faktura byla zaplacená,
 * ale v ledgeru by nic nebylo) a že se vstup z prohlížeče ověřuje.
 */

const sqlMock = vi.fn()
const requireAuthMock = vi.fn()
const syncMock = vi.fn()

vi.mock('@/lib/db', () => ({ sql: (...args: unknown[]) => sqlMock(...args) }))
vi.mock('@/lib/auth', () => ({ authOptions: {}, requireAuth: () => requireAuthMock() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/admin/db', () => ({ adminDb: Object.assign(vi.fn(), { batch: vi.fn() }) }))
vi.mock('@/lib/invoices', () => ({
  parseInvoiceForm: vi.fn(),
  insertInvoice: vi.fn(),
  updateInvoiceRow: vi.fn(),
  deleteInvoiceRow: vi.fn(),
  syncInvoiceTransaction: (...a: unknown[]) => syncMock(...a),
  INVOICE_COLUMNS: '',
  INCOME_JOIN: '',
  OTHER_INCOME_COUNT: '',
  toInvoiceItem: vi.fn(),
  toInvoiceRegistryItem: vi.fn(),
}))

import { setInvoicePaid } from '@/app/dashboard/finance/invoice-actions'

const ID = '11111111-1111-4111-8111-111111111111'

function queueSql(rows: unknown[]) {
  const calls: { text: string; params: unknown[] }[] = []
  sqlMock.mockImplementation(async (strings: TemplateStringsArray, ...params: unknown[]) => {
    calls.push({ text: strings.join('?'), params })
    return rows
  })
  return calls
}

beforeEach(() => {
  sqlMock.mockReset()
  requireAuthMock.mockReset()
  syncMock.mockReset()
  requireAuthMock.mockResolvedValue(undefined)
  syncMock.mockResolvedValue(undefined)
})

describe('Zaplaceno jedním kliknutím', () => {
  it('bez přihlášení nic nezapíše', async () => {
    requireAuthMock.mockRejectedValue(new Error('Neautorizovaný přístup'))
    const calls = queueSql([{ project_id: null }])
    const result = await setInvoicePaid(ID, '2026-11-12')
    expect(result.error).toBeTruthy()
    expect(calls).toEqual([])
    expect(syncMock).not.toHaveBeenCalled()
  })

  it('zapíše datum zaplacení a srovná ledger', async () => {
    const calls = queueSql([{ project_id: 'p1' }])
    const result = await setInvoicePaid(ID, '2026-11-12')
    expect(result).toEqual({})
    expect(calls).toHaveLength(1)
    expect(calls[0].text).toMatch(/UPDATE invoices SET paid_on/)
    expect(calls[0].params).toEqual(['2026-11-12', ID])
    // Bez tohohle by faktura byla zaplacená, ale v ledgeru by nebyl příjem.
    expect(syncMock).toHaveBeenCalledWith(ID)
  })

  it('vrácení mezi pohledávky pošle null a taky srovná ledger', async () => {
    const calls = queueSql([{ project_id: null }])
    expect(await setInvoicePaid(ID, null)).toEqual({})
    expect(calls[0].params).toEqual([null, ID])
    expect(syncMock).toHaveBeenCalledWith(ID)
  })

  it('cizí nebo nesmyslné id se do databáze vůbec nedostane', async () => {
    const calls = queueSql([])
    expect((await setInvoicePaid('neco-jineho', '2026-11-12')).error).toBe('Faktura nenalezena')
    expect(calls).toEqual([])
    expect(syncMock).not.toHaveBeenCalled()
  })

  it('neplatné datum se odmítne, ledger se nehýbe', async () => {
    const calls = queueSql([])
    for (const bad of ['2026-99-99', 'dnes', '12.11.2026', '']) {
      expect((await setInvoicePaid(ID, bad)).error).toBe('Neplatné datum zaplacení')
    }
    expect(calls).toEqual([])
    expect(syncMock).not.toHaveBeenCalled()
  })

  it('neexistující faktura nezavolá srovnání ledgeru', async () => {
    queueSql([])
    expect((await setInvoicePaid(ID, '2026-11-12')).error).toBe('Faktura nenalezena')
    expect(syncMock).not.toHaveBeenCalled()
  })
})
