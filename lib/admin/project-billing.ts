import 'server-only'
import { adminDb } from './db'
import { extraDepositsSql, invoicePaymentsSql } from './project-payments'
import { isInvoiceKind, type ProjectBilling } from './invoice-kinds'

/**
 * Peníze jedné zakázky pro rozpis faktur (R-143): cena, co je zaplacené
 * a které platné korunové faktury k ní existují.
 *
 * „Zaplaceno" se počítá přesně jako „zbývá doplatit" jinde v adminu
 * (`remainingSql`, R-110, R-125) — vlastní záloha zakázky, ručně zapsané
 * zálohy a příjmy, které faktury samy založily. Zakázka označená „Peníze
 * dorazily" je zaplacená celá.
 *
 * Nové sloupce (`paid`, `invoice_kind`) se čtou přes `to_jsonb(řádek)`, ať
 * dotaz funguje i na databázi bez migrace 132.
 */
export async function loadProjectBilling(projectId: string): Promise<ProjectBilling | null> {
  const [projectRows, invoiceRows] = await adminDb.batch([
    {
      text: `
        SELECT p.client_name, p.description, coalesce(p.price, 0)::float AS price,
               (to_jsonb(p)->>'paid')::boolean AS fully_paid,
               (CASE WHEN p.deposit_paid THEN coalesce(p.deposit_amount, 0) ELSE 0 END
                + ${extraDepositsSql('p')} + ${invoicePaymentsSql('p')})::float AS paid
        FROM projects p WHERE p.id = $1 LIMIT 1
      `,
      params: [projectId],
    },
    {
      text: `
        SELECT i.invoice_number, to_jsonb(i)->>'invoice_kind' AS kind, i.amount::float AS amount,
               i.paid_on IS NOT NULL AS paid
        FROM invoices i
        WHERE i.project_id = $1
          AND i.cancelled_at IS NULL
          AND i.direction = 'issued'
          AND i.currency = 'CZK'
        ORDER BY i.issued_on, i.created_at
        LIMIT 50
      `,
      params: [projectId],
    },
  ])

  const p = projectRows[0] as
    | { client_name: string; description: string | null; price: number; fully_paid: boolean | null; paid: number }
    | undefined
  if (!p) return null

  const price = Number(p.price ?? 0)
  const description = p.description?.trim() ?? ''
  return {
    projectId,
    label: description ? `${p.client_name} — ${description}` : p.client_name,
    description,
    price,
    paid: p.fully_paid ? price : Number(p.paid ?? 0),
    invoices: (invoiceRows as { invoice_number: string | null; kind: string | null; amount: number; paid: boolean }[]).map(r => ({
      number: r.invoice_number ?? '',
      kind: isInvoiceKind(r.kind) ? r.kind : null,
      amount: Number(r.amount),
      paid: r.paid === true,
    })),
  }
}

let kindsReady: boolean | null = null

/**
 * Je v databázi migrace 132? Bez ní by se druh faktury neuložil a zálohová
 * faktura by vyšla jako obyčejná — taková se proto nevystaví.
 */
export async function isKindsReady(): Promise<boolean> {
  if (kindsReady) return true
  const [rows] = await adminDb.batch([
    {
      text: `
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'invoices' AND column_name = 'invoice_kind'
        LIMIT 1
      `,
      params: [],
    },
  ])
  kindsReady = rows.length > 0
  return kindsReady
}

/** Jen pro testy. */
export function resetKindsReadyForTests(): void {
  kindsReady = null
}
