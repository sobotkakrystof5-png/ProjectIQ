'use server'

import { revalidatePath } from 'next/cache'
import { requireAuth } from '@/lib/auth'
import { lookupIco, type AresLookup } from '@/lib/ares'
import { syncInvoiceTransaction } from '@/lib/invoices'
import {
  cancelInvoiceRow, issueInvoice, issueInvoiceSchema, issuerProfileSchema,
  loadIssuerProfile, saveIssuerProfile, InvoiceIssueError,
} from '@/lib/admin/invoicing'

/**
 * Vystavení faktury, fakturační údaje a dotaz do rejstříku (AD12).
 *
 * Archivace cizích PDF zůstává v `app/dashboard/finance/invoice-actions.ts` —
 * tyhle akce se jí nedotýkají. Všechno pod `requireAuth()`: faktura nese
 * údaje klienta a nikdy nesmí být veřejná.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** První srozumitelná hláška ze Zodu — uživatel má vidět jednu větu, ne výpis. */
function firstMessage(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? 'Něco v údajích nesedí. Zkontrolujte je prosím.'
}

function revalidateInvoices(projectId: string | null) {
  revalidatePath('/dashboard/faktury')
  revalidatePath('/dashboard/finance')
  if (projectId) revalidatePath(`/dashboard/${projectId}`)
}

export async function issueInvoiceAction(raw: unknown): Promise<{ error?: string; id?: string; number?: string }> {
  await requireAuth()
  const parsed = issueInvoiceSchema.safeParse(raw)
  if (!parsed.success) return { error: firstMessage(parsed.error) }

  try {
    const profile = await loadIssuerProfile()
    const result = await issueInvoice(parsed.data, profile)
    revalidateInvoices(parsed.data.projectId)
    return result
  } catch (err) {
    if (err instanceof InvoiceIssueError) return { error: err.message }
    const message = err instanceof Error ? err.message : ''
    if (message.includes('admin_invoice_sequence_full')) {
      return { error: 'V tomhle roce došla čísla faktur. Ozvěte se, musí se rozšířit řada.' }
    }
    console.error('[faktury] Vystavení selhalo:', err)
    return { error: 'Fakturu se nepodařilo vystavit. Zkuste to prosím znovu.' }
  }
}

export async function saveIssuerProfileAction(raw: unknown): Promise<{ error?: string }> {
  await requireAuth()
  const parsed = issuerProfileSchema.safeParse(raw)
  if (!parsed.success) return { error: firstMessage(parsed.error) }

  try {
    await saveIssuerProfile(parsed.data)
    revalidatePath('/dashboard/faktury/nastaveni')
    revalidatePath('/dashboard/faktury/nova')
    return {}
  } catch (err) {
    console.error('[faktury] Uložení fakturačních údajů selhalo:', err)
    return { error: 'Údaje se nepodařilo uložit. Zkuste to prosím znovu.' }
  }
}

/**
 * Dotaz do ARESu podle IČO (R-086). Selhání rejstříku **nikdy** neblokuje
 * formulář — vrací se hláška a člověk údaje dopíše ručně.
 */
export async function lookupIcoAction(ico: unknown): Promise<AresLookup> {
  await requireAuth()
  if (typeof ico !== 'string' || ico.length > 20) {
    return { ok: false, message: 'Tohle IČO neexistuje. Zkontrolujte číslice.' }
  }
  return lookupIco(ico)
}

export async function cancelInvoiceAction(id: string): Promise<{ error?: string }> {
  await requireAuth()
  if (!UUID_RE.test(id)) return { error: 'Faktura nenalezena' }

  try {
    const result = await cancelInvoiceRow(id)
    if (!result) return { error: 'Tahle faktura se stornovat nedá.' }
    // Příjem, který faktura v ledgeru založila, musí zmizet s ní.
    await syncInvoiceTransaction(id)
    revalidateInvoices(result.projectId)
    revalidatePath(`/dashboard/faktury/${id}`)
    return {}
  } catch (err) {
    console.error('[faktury] Storno selhalo:', err)
    return { error: 'Storno se nepodařilo. Zkuste to prosím znovu.' }
  }
}
