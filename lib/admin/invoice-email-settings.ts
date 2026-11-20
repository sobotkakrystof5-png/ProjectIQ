import 'server-only'
import { sql } from '@/lib/db'
import {
  DEFAULT_INVOICE_EMAIL_TEMPLATE,
  invoiceEmailTemplateSchema,
  type InvoiceEmailTemplate,
} from './invoice-email-template'

/**
 * Uložená šablona e-mailu s fakturou (R-139). Jeden sloupec v jediném řádku
 * `admin_settings` (migrace 129).
 *
 * Čtení nikdy nespadne: bez migrace, bez řádku nebo s poškozeným záznamem se
 * vrátí výchozí text — odeslání faktury nesmí záviset na tom, jestli si někdo
 * šablonu kdy nastavil. Čte se přes `to_jsonb(řádek)`, takže dotaz projde i na
 * databázi, kde sloupec ještě není.
 */

export type LoadedInvoiceEmailTemplate = { template: InvoiceEmailTemplate; custom: boolean }

export async function loadInvoiceEmailTemplate(): Promise<LoadedInvoiceEmailTemplate> {
  try {
    const rows = await sql`
      SELECT to_jsonb(s) -> 'invoice_email_template' AS template
      FROM admin_settings s WHERE s.id = true LIMIT 1
    `
    const raw = (rows[0] as { template: unknown } | undefined)?.template
    const parsed = invoiceEmailTemplateSchema.safeParse(raw)
    if (parsed.success) return { template: parsed.data, custom: true }
  } catch (err) {
    console.error('[Faktury] Šablonu e-mailu se nepodařilo přečíst, použiju výchozí.', err instanceof Error ? err.message : String(err))
  }
  return { template: { ...DEFAULT_INVOICE_EMAIL_TEMPLATE }, custom: false }
}

export async function saveInvoiceEmailTemplate(
  template: InvoiceEmailTemplate,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await sql`
      INSERT INTO admin_settings (id, invoice_email_template, updated_at)
      VALUES (true, ${JSON.stringify(template)}::jsonb, now())
      ON CONFLICT (id) DO UPDATE SET invoice_email_template = EXCLUDED.invoice_email_template, updated_at = now()
    `
    return { ok: true }
  } catch (err) {
    if ((err as { code?: string })?.code === '42703') {
      return { ok: false, error: 'Šablonu zatím nejde uložit: v databázi chybí migrace 129_faktury_sablona_emailu.' }
    }
    console.error('[Faktury] Šablonu e-mailu se nepodařilo uložit.', err instanceof Error ? err.message : String(err))
    return { ok: false, error: 'Šablonu se nepodařilo uložit. Zkuste to prosím znovu.' }
  }
}
