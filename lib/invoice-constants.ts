/**
 * Konstanty archivu faktur. Samostatný soubor proto, že je potřebují i
 * klientské komponenty — `lib/invoices.ts` tahá `lib/db.ts`, a ten nemá
 * v klientském bundlu co dělat.
 */

/**
 * Strop nahrávaného PDF.
 *
 * Plán počítal s 5 MB, realita Vercelu je tvrdší: serverless funkce odmítne
 * request s tělem nad 4,5 MB dřív, než se kód vůbec spustí — uživatel by
 * u souborů mezi 4,5 a 5 MB dostal neinformativní platformní 413. 4 MB
 * nechává rezervu na multipart overhead a hlásí chybu vlastními slovy.
 */
export const MAX_PDF_BYTES = 4 * 1024 * 1024
export const MAX_PDF_LABEL = '4 MB'

/** Kategorie příjmové transakce, kterou faktura zakládá — odlišuje ji v ledgeru od 'zakázka'. */
export const INVOICE_INCOME_CATEGORY = 'faktura'

export const INVOICE_CURRENCIES = ['CZK', 'EUR'] as const
export type InvoiceCurrency = (typeof INVOICE_CURRENCIES)[number]
