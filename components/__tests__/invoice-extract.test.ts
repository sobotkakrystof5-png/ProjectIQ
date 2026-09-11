import { describe, it, expect } from 'vitest'
import { applyInvoiceExtract, emptyInvoiceForm } from '@/components/InvoiceFields'

/**
 * Sloučení AI přepisu do formuláře. Pravidlo fáze: přepis pole doplňuje,
 * nikdy nemaže to, co už uživatel napsal, a nikdy nesahá na `paid_on` —
 * datum zaplacení rozhoduje o zdanitelném příjmu a doklad o něm nic neříká.
 */
describe('applyInvoiceExtract', () => {
  const base = { ...emptyInvoiceForm({ issued_on: '2026-01-01' }), paid_on: '2026-02-02' }

  it('doplní, co model našel', () => {
    const next = applyInvoiceExtract(base, {
      invoice_number: '2026014',
      issued_on: '2026-03-14',
      due_on: '2026-03-28',
      amount: 37500,
      currency: 'CZK',
      client_name: 'Pekárna Novák s.r.o.',
      client_ico: '27654321',
      client_dic: 'CZ27654321',
    })

    expect(next.invoice_number).toBe('2026014')
    expect(next.issued_on).toBe('2026-03-14')
    expect(next.due_on).toBe('2026-03-28')
    expect(next.amount).toBe('37500')
    expect(next.client_name).toBe('Pekárna Novák s.r.o.')
    expect(next.client_ico).toBe('27654321')
  })

  it('nepřepíše ručně vyplněné pole hodnotou, kterou model nenašel', () => {
    const filled = { ...base, invoice_number: 'RUCNE-1', amount: '1000' }
    const next = applyInvoiceExtract(filled, {
      invoice_number: null,
      amount: null,
      client_name: 'Někdo s.r.o.',
    })

    expect(next.invoice_number).toBe('RUCNE-1')
    expect(next.amount).toBe('1000')
    expect(next.client_name).toBe('Někdo s.r.o.')
  })

  it('nikdy nesahá na datum zaplacení ani na zakázku', () => {
    const withProject = { ...base, project_id: 'abc-123' }
    const next = applyInvoiceExtract(withProject, { invoice_number: '2026014' })

    expect(next.paid_on).toBe('2026-02-02')
    expect(next.project_id).toBe('abc-123')
  })

  it('prázdné řetězce z modelu se chovají jako „nenalezeno“', () => {
    const filled = { ...base, client_ico: '12345678' }
    const next = applyInvoiceExtract(filled, { client_ico: '   ' })

    expect(next.client_ico).toBe('12345678')
  })
})
