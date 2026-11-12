import { describe, expect, it } from 'vitest'
import { invoiceHtml, spaydPaymentString, variableSymbol, type PdfInvoice } from '@/lib/invoice-pdf/render'
import { invoiceTotal, itemTotals } from '@/lib/invoice-pdf/totals'

/**
 * Sdílené PDF faktury (AD12). Workspace i admin kreslí týž doklad, takže
 * tenhle test hlídá obsah, na kterém záleží z obou stran: celé datum,
 * variabilní symbol ze samých číslic, QR jen u faktury, která se ještě
 * platí, a žádné HTML od uživatele.
 */

const invoice: PdfInvoice = {
  number: '2026001',
  issuer: {
    name: 'Kryštof Sobotka',
    address: 'Kamenice 64, 294 04 Dobšín',
    ico: '29977231',
    dic: '',
    bank: 'CZ6508000000192000145399',
    vatPayer: false,
  },
  counterparty: { name: 'Klient s.r.o.', address: 'Dlouhá 1, Praha', ico: '27074358', dic: '' },
  issuedOn: '2026-11-12',
  suppliedOn: '2026-11-12',
  dueOn: '2026-11-26',
  paidOn: null,
  amount: 25000,
  currency: 'CZK',
  items: [{ description: 'Web na míru', quantity: 1, unitPrice: 25000, vatRate: 0 }],
  note: '',
  payable: true,
}

describe('součty', () => {
  it('zaokrouhlují po položkách v haléřích', () => {
    expect(itemTotals({ quantity: 3, unitPrice: 1200.5, vatRate: 21 })).toEqual({
      net: 3601.5,
      vat: 756.32,
      total: 4357.82,
    })
    expect(invoiceTotal([
      { description: 'Práce', quantity: 3, unitPrice: 1200.5, vatRate: 21 },
      { description: 'Doména', quantity: 1, unitPrice: 350, vatRate: 21 },
    ])).toBe(4781.32)
  })
})

describe('variabilní symbol', () => {
  it('je jen z číslic a nejvýš deset znaků', () => {
    expect(variableSymbol('2026001')).toBe('2026001')
    // Workspace čísluje s pomlčkou; na faktuře i v QR musí být totéž.
    expect(variableSymbol('2026-000042')).toBe('2026000042')
    expect(variableSymbol('F/2026/00123456789')).toBe('2026001234')
  })

  it('v textu faktury i v QR je stejný', async () => {
    const html = await invoiceHtml({ ...invoice, number: '2026-000042' }, { name: 'ZakazIQ', logo: null })
    expect(html).toContain('Variabilní symbol: <span class="numbers">2026000042</span>')
    expect(spaydPaymentString({ ...invoice, number: '2026-000042' })).toContain('*X-VS:2026000042')
  })
})

describe('obsah dokladu', () => {
  it('tiskne celé datum včetně roku', async () => {
    const html = await invoiceHtml(invoice, { name: 'ZakazIQ', logo: null })
    expect(html).toContain('12. 11. 2026')
    expect(html).toContain('26. 11. 2026')
  })

  it('neplátce DPH nemá sloupec DPH a má o tom větu', async () => {
    const html = await invoiceHtml(invoice, { name: 'ZakazIQ', logo: null })
    expect(html).not.toContain('<th>DPH</th>')
    expect(html).toContain('Dodavatel není plátce DPH.')
  })

  it('QR se kreslí jen u faktury, která se ještě platí', async () => {
    expect(await invoiceHtml(invoice, { name: 'ZakazIQ', logo: null })).toContain('Zaplatit QR kódem')
    expect(await invoiceHtml({ ...invoice, payable: false }, { name: 'ZakazIQ', logo: null })).not.toContain('Zaplatit QR kódem')
    expect(spaydPaymentString({ ...invoice, currency: 'EUR' })).toBeNull()
    expect(spaydPaymentString({ ...invoice, issuer: { ...invoice.issuer, bank: '19-2000145399/0800' } })).toBeNull()
  })

  it('stornovaný doklad to má napsané a neplatí se', async () => {
    const html = await invoiceHtml({ ...invoice, cancelled: true, payable: false }, { name: 'ZakazIQ', logo: null })
    expect(html).toContain('storno')
    expect(html).toContain('Doklad byl stornován a neplatí.')
    expect(html).not.toContain('Zaplatit QR kódem')
  })

  it('text od uživatele se nikdy nevykreslí jako HTML', async () => {
    const html = await invoiceHtml(
      { ...invoice, note: '<script>alert(1)</script>', counterparty: { ...invoice.counterparty, name: '<b>Klient</b>' } },
      { name: 'ZakazIQ', logo: null },
    )
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;b&gt;Klient&lt;/b&gt;')
  })
})
