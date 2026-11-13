import { describe, expect, it } from 'vitest'
import {
  daysOverdue,
  invoiceSql,
  invoiceState,
  isInvoiceOutstanding,
  isInvoiceOverdue,
} from '@/lib/invoice-status'

/**
 * Stav faktury má od AD13 jeden zdroj. Dřív se počítal čtyřmi způsoby
 * a dva z nich se lišily ve dvou věcech: brali dnešek v UTC a neznali
 * storno (AD12).
 */

const faktura = (over: Partial<Parameters<typeof invoiceState>[0]> = {}) => ({
  paid_on: null,
  due_on: '2026-11-10',
  cancelled_at: null,
  ...over,
})

describe('invoiceState', () => {
  it('storno má přednost před vším ostatním', () => {
    expect(invoiceState(faktura({ cancelled_at: '2026-11-12T10:00:00Z', paid_on: '2026-11-11' }), '2026-11-13')).toBe(
      'cancelled',
    )
  })

  it('zaplacená faktura není po splatnosti, ani když termín dávno byl', () => {
    expect(invoiceState(faktura({ paid_on: '2026-11-20' }), '2026-11-30')).toBe('paid')
  })

  it('po splatnosti je až den po termínu', () => {
    expect(invoiceState(faktura(), '2026-11-09')).toBe('open')
    // Splatnost je dnes → ještě ne po splatnosti.
    expect(invoiceState(faktura(), '2026-11-10')).toBe('open')
    expect(invoiceState(faktura(), '2026-11-11')).toBe('overdue')
  })

  it('faktura bez splatnosti nikdy po splatnosti není', () => {
    expect(invoiceState(faktura({ due_on: null }), '2030-01-01')).toBe('open')
  })

  it('stornovaný doklad není pohledávka', () => {
    const storno = faktura({ cancelled_at: '2026-11-12T10:00:00Z' })
    expect(isInvoiceOutstanding(storno, '2026-12-01')).toBe(false)
    expect(isInvoiceOverdue(storno, '2026-12-01')).toBe(false)
  })

  it('pohledávka je nezaplacená, nestornovaná — i když je po splatnosti', () => {
    expect(isInvoiceOutstanding(faktura(), '2026-11-01')).toBe(true)
    expect(isInvoiceOutstanding(faktura(), '2026-12-01')).toBe(true)
  })
})

describe('daysOverdue', () => {
  it('počítá dny od splatnosti, přes konec měsíce i roku', () => {
    expect(daysOverdue(faktura(), '2026-11-10')).toBe(0)
    expect(daysOverdue(faktura(), '2026-11-11')).toBe(1)
    expect(daysOverdue(faktura({ due_on: '2026-12-30' }), '2027-01-02')).toBe(3)
  })

  it('zaplacená ani stornovaná faktura nemá dny po splatnosti', () => {
    expect(daysOverdue(faktura({ paid_on: '2026-11-11' }), '2026-12-01')).toBe(0)
    expect(daysOverdue(faktura({ cancelled_at: '2026-11-11T08:00:00Z' }), '2026-12-01')).toBe(0)
  })
})

describe('podmínky pro SQL', () => {
  it('po splatnosti i pohledávka vynechávají storno', () => {
    expect(invoiceSql.overdue('i')).toContain('i.cancelled_at IS NULL')
    expect(invoiceSql.outstanding('i')).toContain('i.cancelled_at IS NULL')
  })

  it('respektují alias tabulky', () => {
    expect(invoiceSql.paid('f')).toBe('f.paid_on IS NOT NULL')
    expect(invoiceSql.overdue('f')).toContain('f.due_on < current_date')
  })
})
