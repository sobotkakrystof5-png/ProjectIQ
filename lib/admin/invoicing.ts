import 'server-only'
import { z } from 'zod'
import { adminDb, q } from './db'
import {
  EMPTY_PROFILE, invoiceSums, issueInvoiceSchema, issuerProfileSchema, itemSchema, profileReady,
  type IssuerProfile, type IssueInvoiceInput, type IssueOptions, type IssueProjectOption,
} from './invoice-schema'
import type { InvoicePdfDoc } from '@/lib/invoice-pdf/render'

// Pravidla a počty jsou v `invoice-schema.ts` (platí i v prohlížeči);
// tenhle soubor je jen ta část, která sahá do databáze.
export {
  EMPTY_PROFILE, invoiceSums, issueInvoiceSchema, issuerProfileSchema, profileReady,
}
export type { IssuerProfile, IssueInvoiceInput, IssueOptions, IssueProjectOption }
export type { InvoiceItemInput } from './invoice-schema'

/**
 * Vystavování faktur v adminu (AD12).
 *
 * Archiv cizích PDF (`lib/invoices.ts`) se tím **nemění**: je to druhá cesta,
 * ne náhrada. Vystavená faktura má položky, snímek dodavatele, číslo z vlastní
 * řady a PDF, které vyrobí aplikace; archivní řádek dál nemá nic z toho.
 * Rozlišuje je `pdf_generated` (migrace 107).
 *
 * Počítá se v haléřích a sdílenou funkcí: `lib/ws/money/calculations.ts`.
 * Druhý výpočet DPH by znamenal, že se faktura Workspace a faktura adminu
 * můžou lišit o korunu.
 */

// ─── Profil dodavatele ──────────────────────────────────────────────────────

/**
 * Profil dodavatele je jeden pro celou aplikaci (jedno IČO, R-011). Na
 * vystaveném dokladu z něj zůstane **snímek** ve sloupci `issuer`, takže
 * pozdější změna adresy nebo účtu nepřepíše starší faktury.
 */
export async function loadIssuerProfile(): Promise<IssuerProfile> {
  const [rows] = await adminDb.batch([q`SELECT issuer_profile FROM admin_settings WHERE id LIMIT 1`])
  const saved = rows[0]?.issuer_profile
  const parsed = issuerProfileSchema.safeParse(saved)
  if (parsed.success) return parsed.data
  // Rozepsaný profil (chybí IČO, než ho člověk doplní) se nesmí ztratit.
  const partial = saved && typeof saved === 'object' && !Array.isArray(saved) ? (saved as Record<string, unknown>) : {}
  const str = (key: keyof IssuerProfile) => (typeof partial[key] === 'string' ? String(partial[key]) : '')
  return {
    ...EMPTY_PROFILE,
    name: str('name'), address: str('address'), ico: str('ico'), dic: str('dic'),
    bank: str('bank'), email: str('email'), phone: str('phone'),
    vatPayer: partial.vatPayer === true,
  }
}

export async function saveIssuerProfile(profile: IssuerProfile): Promise<void> {
  await adminDb.batch([
    q`INSERT INTO admin_settings (id, issuer_profile) VALUES (true, ${JSON.stringify(profile)}::jsonb)
      ON CONFLICT (id) DO UPDATE SET issuer_profile = EXCLUDED.issuer_profile, updated_at = now()`,
  ])
}

// ─── Vystavení ──────────────────────────────────────────────────────────────

export class InvoiceIssueError extends Error {}

/**
 * Vystaví fakturu. Číslo přiděluje databáze (`admin_invoice_issue`) ve stejné
 * transakci jako zápis dokladu — dvě současná vystavení proto nemůžou dostat
 * stejné číslo ani nechat v řadě díru.
 */
export async function issueInvoice(input: IssueInvoiceInput, profile: IssuerProfile): Promise<{ id: string; number: string }> {
  if (!profileReady(profile)) throw new InvoiceIssueError('Nejdřív doplňte své fakturační údaje.')
  if (!profile.vatPayer && input.items.some(item => item.vatRate !== 0)) {
    throw new InvoiceIssueError('Neplátce DPH nemůže účtovat DPH.')
  }

  const sums = invoiceSums(input.items)
  const payload = {
    project_id: input.projectId,
    contact_id: input.contactId,
    client_name: input.counterparty.name,
    client_address: input.counterparty.address,
    client_ico: input.counterparty.ico,
    client_dic: input.counterparty.dic,
    client_email: input.counterparty.email,
    issued_on: input.issuedOn,
    supplied_on: input.suppliedOn,
    due_on: input.dueOn,
    amount: sums.amount,
    vat_total: sums.vat,
    currency: input.currency,
    note: input.note,
    items: input.items,
    // Snímek dodavatele: co platilo v den vystavení, zůstane na dokladu navždy.
    issuer: profile,
  }

  const [rows] = await adminDb.batch([
    q`SELECT admin_invoice_issue(${JSON.stringify(payload)}::jsonb) AS id`,
  ])
  const id = String(rows[0]?.id ?? '')
  if (!id) throw new InvoiceIssueError('Fakturu se nepodařilo vystavit. Zkuste to prosím znovu.')

  const [numberRows] = await adminDb.batch([q`SELECT invoice_number FROM invoices WHERE id = ${id}::uuid`])
  return { id, number: String(numberRows[0]?.invoice_number ?? '') }
}

// ─── Doklad pro PDF ─────────────────────────────────────────────────────────

type DocRow = {
  invoice_number: string
  client_name: string | null
  client_address: string | null
  client_ico: string | null
  client_dic: string | null
  issued_on: string
  supplied_on: string | null
  due_on: string | null
  paid_on: string | null
  cancelled_at: string | null
  amount: number
  currency: string
  note: string | null
  items: unknown
  issuer: unknown
}

/**
 * Faktura z databáze → úzký tvar pro `lib/invoice-pdf/render.ts`.
 * Vrací `null`, když doklad neexistuje nebo ho tahle aplikace nevystavila
 * (archiv cizích PDF se negeneruje, servíruje se nahraný soubor).
 */
export async function loadInvoiceDoc(id: string): Promise<InvoicePdfDoc | null> {
  const [rows] = await adminDb.batch([
    q`SELECT invoice_number, client_name, client_address, client_ico, client_dic,
             issued_on::text, supplied_on::text, due_on::text, paid_on::text, cancelled_at::text,
             amount::float AS amount, currency, note, items, issuer
      FROM invoices WHERE id = ${id}::uuid AND pdf_generated LIMIT 1`,
  ])
  const row = rows[0] as unknown as DocRow | undefined
  if (!row) return null

  const issuer = issuerProfileSchema.safeParse(row.issuer)
  const items = z.array(itemSchema).safeParse(row.items)
  if (!issuer.success || !items.success) return null

  return {
    number: row.invoice_number,
    issuer: {
      name: issuer.data.name, address: issuer.data.address, ico: issuer.data.ico,
      dic: issuer.data.dic, bank: issuer.data.bank, vatPayer: issuer.data.vatPayer,
    },
    counterparty: {
      name: row.client_name ?? '', address: row.client_address ?? '',
      ico: row.client_ico ?? '', dic: row.client_dic ?? '',
    },
    issuedOn: row.issued_on,
    suppliedOn: row.supplied_on ?? row.issued_on,
    dueOn: row.due_on ?? row.issued_on,
    paidOn: row.paid_on,
    amount: Number(row.amount),
    currency: row.currency === 'EUR' ? 'EUR' : 'CZK',
    items: items.data,
    note: row.note ?? '',
    payable: row.paid_on === null && row.cancelled_at === null,
  }
}

// ─── Předvyplnění ───────────────────────────────────────────────────────────

type OptionRow = {
  id: string
  client_name: string
  description: string | null
  price: number | null
  deposit_amount: number | null
  deposit_paid: boolean | null
  client_email: string | null
  contact_id: string | null
  company: string | null
  ico: string | null
  dic: string | null
  contact_email: string | null
  last_name: string | null
  last_address: string | null
  last_ico: string | null
  last_dic: string | null
}

export async function loadIssueOptions(): Promise<IssueOptions> {
  // Kontakt se čte přes rodinu (R-095): sloučený kontakt ukazuje na kořen
  // a faktura může viset na kterémkoli členu rodiny.
  const [profileRows, projectRows] = await adminDb.batch([
    q`SELECT issuer_profile FROM admin_settings WHERE id LIMIT 1`,
    q`SELECT p.id::text, p.client_name, p.description,
             p.price::float AS price, p.deposit_amount::float AS deposit_amount, p.deposit_paid,
             p.client_email, COALESCE(c.id, c0.id)::text AS contact_id,
             c.company, c.ico, c.dic, c.email AS contact_email,
             li.client_name AS last_name, li.client_address AS last_address,
             li.client_ico AS last_ico, li.client_dic AS last_dic
      FROM projects p
      LEFT JOIN contacts c0 ON c0.id = p.contact_id
      LEFT JOIN contacts c ON c.id = COALESCE(c0.merged_into, c0.id)
      LEFT JOIN LATERAL (
        SELECT i.client_name, i.client_address, i.client_ico, i.client_dic
        FROM invoices i
        JOIN contacts ic ON ic.id = i.contact_id
        WHERE i.pdf_generated AND COALESCE(ic.merged_into, ic.id) = c.id
        ORDER BY i.issued_on DESC, i.created_at DESC
        LIMIT 1
      ) li ON true
      WHERE NOT p.lead_pending
      ORDER BY p.created_at DESC
      LIMIT 200`,
  ])

  const savedProfile = issuerProfileSchema.safeParse(profileRows[0]?.issuer_profile)
  const profile = savedProfile.success ? savedProfile.data : await loadIssuerProfile()

  const projects = (projectRows as unknown as OptionRow[]).map((row) => {
    const paidDeposit = row.deposit_paid === true ? (row.deposit_amount ?? 0) : 0
    const remaining = row.price === null ? null : Math.max(0, Math.round((row.price - paidDeposit) * 100) / 100)
    return {
      id: row.id,
      clientName: row.client_name,
      description: row.description,
      remaining,
      contactId: row.contact_id,
      counterparty: {
        name: row.last_name ?? row.company ?? row.client_name ?? '',
        address: row.last_address ?? '',
        ico: row.ico ?? row.last_ico ?? '',
        dic: row.dic ?? row.last_dic ?? '',
        email: row.client_email ?? row.contact_email ?? '',
      },
    }
  })

  return { profile, projects }
}

// ─── Storno ─────────────────────────────────────────────────────────────────

/**
 * Storno vystavené faktury. Doklad zůstává i s číslem (řada nesmí mít díru),
 * jen přestane platit: nemá datum zaplacení a nepočítá se mezi pohledávky.
 * Příjem, který faktura v ledgeru založila, maže `syncInvoiceTransaction`.
 */
export async function cancelInvoiceRow(id: string): Promise<{ projectId: string | null } | null> {
  const [rows] = await adminDb.batch([
    q`UPDATE invoices SET paid_on = NULL, cancelled_at = now(), updated_at = now()
      WHERE id = ${id}::uuid AND pdf_generated AND cancelled_at IS NULL
      RETURNING project_id::text`,
  ])
  if (!rows.length) return null
  return { projectId: (rows[0].project_id as string | null) ?? null }
}
