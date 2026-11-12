/**
 * Součty na faktuře. Jediná kopie pro Workspace i admin (AD12).
 *
 * Počítá se v **haléřích** a zaokrouhluje po jednotlivých položkách — jinak
 * se součet rozejde s tím, co je na dokladu vytištěné. Stejný postup má
 * `admin_invoice_issue` v migraci 107, aby databáze uměla ověřit, že částka
 * poslaná z aplikace sedí na položky.
 *
 * Soubor je záměrně bez `server-only`: počítá z něj i formulář v prohlížeči.
 */

export type InvoiceItemAmounts = {
  description?: string
  quantity: number
  unitPrice: number
  vatRate: number
}

export function itemTotals(item: InvoiceItemAmounts) {
  const net = Math.round(item.quantity * Math.round(item.unitPrice * 100))
  const vat = Math.round((net * item.vatRate) / 100)
  return { net: net / 100, vat: vat / 100, total: (net + vat) / 100 }
}

export function invoiceTotal(items: InvoiceItemAmounts[]) {
  const total = items.reduce((sum, i) => sum + Math.round(itemTotals(i).total * 100), 0)
  if (!Number.isSafeInteger(total) || total > 999999999999) throw new Error('money_amount_too_large')
  return total / 100
}
