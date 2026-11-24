import { describe, expect, it } from 'vitest'
import { czechAccountFromIban, invoiceHtml, normalizeIban, renderInvoicePdf, spaydPaymentString, variableSymbol, vatRecap, type PdfInvoice } from '@/lib/invoice-pdf/render'
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
    tradeName: 'VIZEON',
    registry: 'Fyzická osoba zapsaná v živnostenském rejstříku, Magistrát města Mladá Boleslav',
    email: 'krystof@example.cz',
    web: 'vizeon.cz',
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
    expect(html).toContain('<span class="label">Variabilní symbol</span><span class="num">2026000042</span>')
    expect(spaydPaymentString({ ...invoice, number: '2026-000042' })).toContain('*X-VS:2026000042')
  })
})

describe('obsah dokladu', () => {
  it('tiskne celé datum včetně roku', async () => {
    const html = await invoiceHtml(invoice, { name: 'ZakazIQ', logo: null })
    expect(html).toContain('12. 11. 2026')
    expect(html).toContain('26. 11. 2026')
  })

  it('používá vložená písma, ne výchozí patkové', async () => {
    const html = await invoiceHtml(invoice, { name: 'ZakazIQ', logo: null })
    // `body` samotné prohrává s `[data-app="ws"]` z tokenů Workspace (je to tentýž
    // element) a `var(--font-instrument-sans)` v PDF neexistuje — pak se dokument
    // tiskne patkovým výchozím písmem prohlížeče. Selektor musí zůstat silnější.
    expect(html).toContain('body[data-app="ws"]{font-family:InvoiceSans')
    expect(html).toContain('@font-face')
  })

  it('neplátce DPH nemá sloupec DPH ani „bez DPH" a má o tom větu', async () => {
    const html = await invoiceHtml(invoice, { name: 'ZakazIQ', logo: null })
    expect(html).not.toContain('Sazba DPH')
    expect(html).not.toContain('bez DPH')
    expect(html).toContain('<th class="r">Cena za kus</th>')
    expect(html).toContain('Dodavatel není plátcem DPH.')
  })

  it('má všechny povinné údaje dokladu (R-142)', async () => {
    const html = await invoiceHtml(invoice, { name: 'VIZEON', logo: null })
    for (const povinne of [
      '>Faktura<', 'č. <span class="num">2026001</span>',
      'Dodavatel', 'Kryštof Sobotka', 'Kamenice 64, 294 04 Dobšín', 'IČO <span class="num">29977231</span>',
      'Fyzická osoba zapsaná v živnostenském rejstříku',
      'Odběratel', 'Klient s.r.o.', 'Dlouhá 1, Praha', 'IČO <span class="num">27074358</span>',
      'Datum vystavení', 'Datum uskutečnění plnění', 'Datum splatnosti',
      'Web na míru', 'Množství', 'Cena za kus', 'Celkem k úhradě',
    ]) expect(html, povinne).toContain(povinne)
  })

  it('vždy uvádí, že doklad vystavil ZakazIQ, i s číslem faktury na každé stránce', async () => {
    const html = await invoiceHtml({ ...invoice, issuer: { ...invoice.issuer, tradeName: null, registry: null } }, { name: 'Firma', logo: null })
    expect(html).toContain('Vystaveno v systému ZakazIQ · zakaziq.cz')
    expect(html).toContain('@bottom-left')
    expect(html).toContain('Faktura 2026001 · strana')
  })

  it('číslo faktury nerozbije CSS patičky', async () => {
    const html = await invoiceHtml({ ...invoice, number: '2026"}body{display:none' }, { name: 'Firma', logo: null })
    expect(html).toContain('Faktura 2026bodydisplaynone · strana')
    expect(html).not.toContain('2026"}body{display:none ·')
  })

  it('značka dodavatele je v hlavičce, právní jméno zůstává u dodavatele', async () => {
    const html = await invoiceHtml(invoice, { name: 'Kryštof Sobotka', logo: null })
    expect(html).toContain('<div class="mark">VIZEON</div>')
    expect(html).toContain('<strong>Kryštof Sobotka</strong><p class="trade">VIZEON</p>')
    expect(html).toContain('krystof@example.cz · vizeon.cz')
  })

  it('starší snímek dodavatele bez nových údajů nevytiskne „undefined"', async () => {
    const { tradeName: _t, registry: _r, email: _e, web: _w, ...stary } = invoice.issuer
    const html = await invoiceHtml({ ...invoice, issuer: stary }, { name: 'Kryštof Sobotka', logo: null })
    expect(html).not.toContain('undefined')
    expect(html).not.toContain('null')
    expect(html).toContain('<div class="mark">Kryštof Sobotka</div>')
  })

  it('účet ukáže v tuzemském tvaru i jako IBAN', async () => {
    const html = await invoiceHtml(invoice, { name: 'VIZEON', logo: null })
    expect(html).toContain('19-2000145399/0800')
    expect(html).toContain('CZ65 0800 0000 1920 0014 5399')
    expect(czechAccountFromIban('CZ6508000000192000145399')).toBe('19-2000145399/0800')
    expect(czechAccountFromIban('CZ0001000000000123456789')).toBe('123456789/0100')
    expect(czechAccountFromIban('SK3112000000198742637541')).toBeNull()
    expect(normalizeIban('cz65 0800 0000 1920 0014 5399')).toBe('CZ6508000000192000145399')
    expect(normalizeIban('CZ6608000000192000145399')).toBeNull()
  })

  it('plátce DPH: daňový doklad, sazba u položek a rekapitulace po sazbách', async () => {
    const vatInvoice: PdfInvoice = {
      ...invoice,
      issuer: { ...invoice.issuer, dic: 'CZ27074358', vatPayer: true },
      items: [
        { description: 'Střih', quantity: 1, unitPrice: 650, vatRate: 21 },
        { description: 'Barvení', quantity: 1, unitPrice: 1200, vatRate: 21 },
        { description: 'Šampon', quantity: 2, unitPrice: 180, vatRate: 12 },
      ],
      amount: 2641.7,
    }
    expect(vatRecap(vatInvoice.items)).toEqual([
      { rate: 21, net: 1850, vat: 388.5, total: 2238.5 },
      { rate: 12, net: 360, vat: 43.2, total: 403.2 },
    ])
    const html = await invoiceHtml(vatInvoice, { name: 'Firma', logo: null })
    expect(html).toContain('Faktura – daňový doklad')
    expect(html).toContain('DIČ <span class="num">CZ27074358</span>')
    expect(html).toContain('Cena za kus bez DPH')
    expect(html).toContain('Základ daně')
    expect(html).not.toContain('není plátcem DPH')
  })

  it('zaplacená faktura to má napsané a nenabízí platbu', async () => {
    const html = await invoiceHtml({ ...invoice, paidOn: '2026-11-20', payable: false }, { name: 'VIZEON', logo: null })
    expect(html).toContain('pill-paid">Zaplaceno')
    expect(html).toContain('Uhrazeno <span class="num">20. 11. 2026</span>')
    expect(html).not.toContain('Celkem k úhradě')
    expect(html).not.toContain('Platební údaje')
  })

  it('QR se kreslí jen u faktury, která se ještě platí', async () => {
    expect(await invoiceHtml(invoice, { name: 'ZakazIQ', logo: null })).toContain('QR platba')
    expect(await invoiceHtml({ ...invoice, payable: false }, { name: 'ZakazIQ', logo: null })).not.toContain('QR platba')
    expect(spaydPaymentString({ ...invoice, currency: 'EUR' })).toBeNull()
    expect(spaydPaymentString({ ...invoice, issuer: { ...invoice.issuer, bank: '19-2000145399/0800' } })).toBeNull()
  })

  it('stornovaný doklad to má napsané a neplatí se', async () => {
    const html = await invoiceHtml({ ...invoice, cancelled: true, payable: false }, { name: 'ZakazIQ', logo: null })
    expect(html).toContain('pill-void">Stornováno')
    expect(html).toContain('Tento doklad byl stornován a neplatí. Nic neplaťte.')
    expect(html).not.toContain('Celkem k úhradě')
    expect(html).not.toContain('Platební údaje')
    expect(html).not.toContain('QR platba')
    // I kdyby volající omylem nechal `payable`, storno se zaplatit nedá.
    expect(spaydPaymentString({ ...invoice, cancelled: true })).toBeNull()
  })

  // Skutečné vykreslení potřebuje Chrome na počítači, proto za přepínačem
  // (stejně jako `WS_PDF_SMOKE` ve Workspace): `PDF_SMOKE=1 npx vitest run lib/__tests__/invoice-pdf.test.ts`.
  it.runIf(process.env.PDF_SMOKE === '1')('se skutečně vykreslí do PDF i s QR a českými znaky', async () => {
    const pdf = await renderInvoicePdf(
      { ...invoice, counterparty: { ...invoice.counterparty, name: 'Žluťoučký kůň, s.r.o.' } },
      { name: 'ZakazIQ', logo: null },
    )
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
    expect(pdf.length).toBeGreaterThan(10000)
  }, 60000)

  it('text od uživatele se nikdy nevykreslí jako HTML', async () => {
    const html = await invoiceHtml(
      { ...invoice, note: '<script>alert(1)</script>', counterparty: { ...invoice.counterparty, name: '<b>Klient</b>' } },
      { name: 'ZakazIQ', logo: null },
    )
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;b&gt;Klient&lt;/b&gt;')
    const issuerHtml = await invoiceHtml(
      { ...invoice, issuer: { ...invoice.issuer, tradeName: '<img src=x>', registry: '<script>x</script>', web: '"><i>' } },
      { name: 'ZakazIQ', logo: null },
    )
    expect(issuerHtml).not.toContain('<img src=x>')
    expect(issuerHtml).not.toContain('<script>x</script>')
    expect(issuerHtml).not.toContain('"><i>')
  })
})

describe('druh dokladu (R-143)', () => {
  const settlement = {
    price: 100000,
    invoices: [{ number: '2026001', kind: 'deposit' as const, amount: 30000, paid: true }],
    paidOutside: 0,
    thisAmount: 30000,
    thisPercent: 30,
    remainingAfter: 40000,
  }

  it('bez druhu zůstává obyčejná faktura bez rozpisu', async () => {
    const html = await invoiceHtml(invoice, { name: 'VIZEON', logo: null })
    expect(html).toContain('<div class="doc-kind">Faktura</div>')
    expect(html).not.toContain('Rozpis ceny zakázky')
  })

  it('plátce DPH: zálohová není daňový doklad, částečná ano', async () => {
    const vatIssuer = { ...invoice.issuer, dic: 'CZ27074358', vatPayer: true }
    const deposit = await invoiceHtml(
      { ...invoice, issuer: vatIssuer, document: { kind: 'deposit', percent: 30, settlement: null } },
      { name: 'Firma', logo: null },
    )
    expect(deposit).toContain('<div class="doc-kind">Zálohová faktura</div>')
    expect(deposit).not.toContain('daňový doklad<')
    const partial = await invoiceHtml(
      { ...invoice, issuer: vatIssuer, document: { kind: 'partial', percent: 30, settlement } },
      { name: 'Firma', logo: null },
    )
    expect(partial).toContain('Částečná faktura – daňový doklad')
    expect(partial).toContain('Tato faktura · 30 %')
  })

  it('rozpis v eurech se netiskne — cena zakázky je v korunách', async () => {
    const html = await invoiceHtml(
      { ...invoice, currency: 'EUR', document: { kind: 'partial', percent: 30, settlement } },
      { name: 'Firma', logo: null },
    )
    expect(html).not.toContain('Rozpis ceny zakázky')
  })
})
