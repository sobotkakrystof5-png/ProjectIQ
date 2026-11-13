import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * AD08: „Zaplaceno" jedním kliknutím ve výpisu faktur.
 *
 * Akce **nepřidává peněžní logiku** — nastaví `paid_on` a pustí tytéž
 * dotazy pro srovnání ledgeru, jaké používá formulář. Test hlídá, že se
 * to opravdu děje (bez toho by faktura byla zaplacená, ale v ledgeru by
 * nic nebylo) a že se vstup z prohlížeče ověřuje.
 *
 * Od AD13 jde zaplacení **a** srovnání ledgeru jednou dávkou: mezi nimi
 * nesmí nic spadnout, jinak je faktura zaplacená bez příjmu.
 */

const sqlMock = vi.fn()
const requireAuthMock = vi.fn()
const batchMock = vi.fn()

vi.mock('@/lib/db', () => ({ sql: (...args: unknown[]) => sqlMock(...args) }))
vi.mock('@/lib/auth', () => ({ authOptions: {}, requireAuth: () => requireAuthMock() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/admin/db', () => ({
  adminDb: Object.assign(vi.fn(), { batch: (...a: unknown[]) => batchMock(...a) }),
}))
vi.mock('@/lib/admin/ledger', () => ({
  ledgerSql: async () => ({ has: true, currency: () => 'currency', czkOnly: () => `currency = 'CZK'` }),
}))
vi.mock('@/lib/invoices', () => ({
  parseInvoiceForm: vi.fn(),
  insertInvoice: vi.fn(),
  updateInvoiceRow: vi.fn(),
  deleteInvoiceRow: vi.fn(),
  invoiceSyncQueries: (_L: unknown, id: string) => [
    { text: 'SYNC 1', params: [id] },
    { text: 'SYNC 2', params: [id] },
  ],
  INVOICE_COLUMNS: '',
  INCOME_JOIN: '',
  OTHER_INCOME_COUNT: '',
  toInvoiceItem: vi.fn(),
  toInvoiceRegistryItem: vi.fn(),
}))

import { setInvoicePaid } from '@/app/dashboard/finance/invoice-actions'

const ID = '11111111-1111-4111-8111-111111111111'

type Query = { text: string; params: unknown[] }

/** Dávka vrátí řádky pro první dotaz (UPDATE … RETURNING), zbytek prázdno. */
function queueBatch(updateRows: unknown[]) {
  const batches: Query[][] = []
  batchMock.mockImplementation(async (queries: Query[]) => {
    batches.push(queries)
    return queries.map((_, i) => (i === 0 ? updateRows : []))
  })
  return batches
}

beforeEach(() => {
  sqlMock.mockReset()
  requireAuthMock.mockReset()
  batchMock.mockReset()
  requireAuthMock.mockResolvedValue(undefined)
  sqlMock.mockResolvedValue([])
})

describe('Zaplaceno jedním kliknutím', () => {
  it('bez přihlášení nic nezapíše', async () => {
    requireAuthMock.mockRejectedValue(new Error('Neautorizovaný přístup'))
    const batches = queueBatch([{ project_id: null }])
    const result = await setInvoicePaid(ID, '2026-11-12')
    expect(result.error).toBeTruthy()
    expect(batches).toEqual([])
  })

  it('zapíše datum zaplacení a srovná ledger jednou dávkou', async () => {
    const batches = queueBatch([{ project_id: 'p1' }])
    const result = await setInvoicePaid(ID, '2026-11-12')
    expect(result).toEqual({})

    expect(batches).toHaveLength(1)
    const [queries] = batches
    expect(queries[0].text).toMatch(/UPDATE invoices SET paid_on/)
    expect(queries[0].params).toEqual([ID, '2026-11-12'])
    // Bez tohohle by faktura byla zaplacená, ale v ledgeru by nebyl příjem —
    // a protože je to jedna dávka, nemůže se stát jen jedno z toho.
    expect(queries.slice(1).map((q) => q.text)).toEqual(['SYNC 1', 'SYNC 2'])
  })

  it('vrácení mezi pohledávky pošle null a taky srovná ledger', async () => {
    const batches = queueBatch([{ project_id: null }])
    expect(await setInvoicePaid(ID, null)).toEqual({})
    expect(batches[0][0].params).toEqual([ID, null])
    expect(batches[0]).toHaveLength(3)
  })

  it('cizí nebo nesmyslné id se do databáze vůbec nedostane', async () => {
    const batches = queueBatch([])
    expect((await setInvoicePaid('neco-jineho', '2026-11-12')).error).toBe('Faktura nenalezena')
    expect(batches).toEqual([])
  })

  it('neplatné datum se odmítne, ledger se nehýbe', async () => {
    const batches = queueBatch([])
    for (const bad of ['2026-99-99', 'dnes', '12.11.2026', '']) {
      expect((await setInvoicePaid(ID, bad)).error).toBe('Neplatné datum zaplacení')
    }
    expect(batches).toEqual([])
  })

  it('neexistující faktura skončí hláškou, ne tichým úspěchem', async () => {
    queueBatch([])
    expect((await setInvoicePaid(ID, '2026-11-12')).error).toBe('Faktura nenalezena')
  })

  it('stornovaný doklad se zaplatit nedá', async () => {
    queueBatch([])
    sqlMock.mockResolvedValue([{ cancelled_at: '2026-11-12T10:00:00Z' }])
    expect((await setInvoicePaid(ID, '2026-11-12')).error).toBe(
      'Stornovaná faktura se nedá označit jako zaplacená.',
    )
  })
})
