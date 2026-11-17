import 'server-only'
import { sql } from '@/lib/db'
import { adminDb } from '@/lib/admin/db'
import { loadIssuedInvoiceForPdf } from '@/lib/admin/invoice-issue'
import { loadHandoverForPdf } from '@/lib/admin/handover'
import { renderInvoicePdf } from '@/lib/invoice-pdf/render'
import { renderHandoverPdf } from '@/lib/invoice-pdf/handover'
import { sendInvoiceEmail } from '@/lib/email'

/**
 * Odeslání vystavené faktury klientovi s PDF v příloze.
 *
 * Společné pro tlačítko „Poslat e-mailem" u faktury (AD12) i pro
 * „Schválit a poslat" u konceptu (R-117). **Volat jen z route handleru**,
 * kterému `next.config.mjs` stopuje Chromium — jinde PDF nevznikne.
 *
 * Nic neposílá samo: volá se jen na kliknutí.
 */

export type SendInvoiceResult =
  | { ok: true; number: string }
  | { ok: false; error: string; status: number }

export async function sendIssuedInvoice(
  invoiceId: string,
  opts: { to: string; subject?: string; text?: string; predani?: boolean },
): Promise<SendInvoiceResult> {
  const issued = await loadIssuedInvoiceForPdf(invoiceId)
  if (!issued) return { ok: false, error: 'Poslat jde jen fakturu vystavenou tady.', status: 404 }
  if (issued.invoice.cancelled) {
    return { ok: false, error: 'Stornovanou fakturu neposílejte — vystavte novou.', status: 400 }
  }

  let pdf: Buffer
  try {
    pdf = await renderInvoicePdf(issued.invoice, { name: issued.invoice.issuer.name, logo: null })
  } catch (err) {
    console.error('[Faktury] PDF k e-mailu se nepodařilo vyrobit.', err instanceof Error ? `${err.name}: ${err.message}` : String(err))
    return { ok: false, error: 'PDF se nepovedlo připravit, e-mail jsem neposlal.', status: 503 }
  }

  const subject = opts.subject || `Faktura ${issued.invoice.number}`
  const text =
    opts.text ||
    `Dobrý den,\n\nposílám fakturu ${issued.invoice.number} se splatností ${czDate(issued.invoice.dueOn)}.\nNajdete ji v příloze.\n\nDěkuju,\n${issued.invoice.issuer.name}`

  // Předávací dokument se přikládá jen na výslovné zaškrtnutí a jen když
  // u zakázky je vyplněný. Když se nepodaří, e-mail se **neodešle** —
  // klient by dostal fakturu bez soupisu, o kterém si myslíte, že ho má.
  const attachments = [{ filename: issued.filename, content: pdf }]
  if (opts.predani === true) {
    const projectRows = await adminDb<{ project_id: string | null }>`
      SELECT project_id::text AS project_id FROM invoices WHERE id = ${invoiceId} LIMIT 1
    `
    const projectId = projectRows[0]?.project_id ?? null
    const handover = projectId === null ? null : await loadHandoverForPdf(projectId)
    if (!handover) {
      return { ok: false, error: 'Předávací dokument u téhle zakázky zatím není vyplněný.', status: 400 }
    }
    try {
      const handoverPdf = await renderHandoverPdf(
        {
          projectTitle: handover.projectTitle,
          clientName: handover.clientName,
          issuerName: handover.issuerName,
          issuedOn: handover.issuedOn,
          summary: handover.doc.summary,
          items: handover.doc.items,
          access: handover.doc.access,
          maintenance: handover.doc.maintenance,
          note: handover.doc.note,
        },
        { name: handover.issuerName, logo: null },
      )
      attachments.push({ filename: handover.filename, content: handoverPdf })
    } catch (err) {
      console.error('[Faktury] Předávací dokument se nepodařilo vyrobit.', err instanceof Error ? `${err.name}: ${err.message}` : String(err))
      return { ok: false, error: 'Předávací dokument se nepovedlo připravit, e-mail jsem neposlal.', status: 503 }
    }
  }

  const sent = await sendInvoiceEmail({ to: opts.to, subject, text, pdfs: attachments })
  if (!sent) return { ok: false, error: 'E-mail se nepodařilo odeslat. Zkuste to prosím znovu.', status: 502 }

  // `client_email` přidala migrace 117; bez ní se zapíše aspoň čas odeslání.
  try {
    await sql`UPDATE invoices SET sent_at = now(), client_email = ${opts.to} WHERE id = ${invoiceId}`
  } catch (err) {
    // E-mail už odešel — chyba zápisu nesmí tvrdit opak, jen se zaloguje.
    if ((err as { code?: string })?.code === '42703') {
      await sql`UPDATE invoices SET sent_at = now() WHERE id = ${invoiceId}`
    } else {
      console.error('[Faktury] Odeslání se nepodařilo zapsat.', err instanceof Error ? err.message : String(err))
    }
  }
  return { ok: true, number: issued.invoice.number }
}

/** 2026-11-30 → 30. 11. 2026 — v e-mailu klientovi, ne ISO. */
function czDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return `${d}. ${m}. ${y}`
}
