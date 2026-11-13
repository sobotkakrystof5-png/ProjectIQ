import 'server-only'
import { sql } from '@/lib/db'
import { adminDb, type AdminQuery } from './db'
import { invoiceTotal } from '@/lib/invoice-pdf/totals'
import type { PdfInvoice } from '@/lib/invoice-pdf/render'
import { addIsoDays, getPragueTodayISO } from '@/lib/prague-time'
import {
  DEFAULT_DUE_DAYS,
  EMPTY_ISSUER,
  issuerProfileSchema,
  type IssueInvoiceInput,
  type IssuerProfile,
} from './invoice-issue-schema'

/**
 * Vystavení faktury v adminu (AD12).
 *
 * Doklad vzniká funkcí `admin_invoice_issue` (migrace 107): číslo z řady
 * a řádek faktury v jedné transakci, pod zámkem jediného řádku nastavení.
 * Aplikace číslo nikdy nepočítá — kontrola v kódu by byla TOCTOU, přesně
 * jak to repo už jednou zažilo (migrace 046).
 *
 * **Vystavení nezakládá příjem.** Daňová evidence jede na hotovostním
 * principu (R-011): do ledgeru fakturu zapíše až `syncInvoiceTransaction`
 * ve chvíli, kdy dostane `paid_on`. Archiv cizích PDF se tím nemění.
 */

export type IssuerSettings = { profile: IssuerProfile; configured: boolean }

/**
 * Je v databázi migrace 107?
 *
 * Migrace pouští Kryštof, a může to být až po nasazení větve — stejná situace
 * jako u 105 v AD10. Dotazy na nové sloupce proto nejdou „naslepo": dokud
 * 107 nedoběhne, chová se admin přesně jako dřív (archiv cizích PDF) a jen
 * neukazuje vystavování. Výsledek se drží v paměti procesu, takže je to
 * jeden dotaz na studený start.
 */
let issuingReady: boolean | null = null

export async function isIssuingReady(): Promise<boolean> {
  if (issuingReady !== null) return issuingReady
  const [rows] = await adminDb.batch([
    {
      text: `
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'invoices' AND column_name = 'number_seq'
        LIMIT 1
      `,
      params: [],
    },
  ])
  issuingReady = rows.length > 0
  return issuingReady
}

/** Jen pro testy — po doběhnutí migrace v testovací DB se zjištění musí zahodit. */
export function resetIssuingReadyForTests(): void {
  issuingReady = null
}

export async function loadIssuerProfile(): Promise<IssuerSettings> {
  if (!(await isIssuingReady())) return { profile: EMPTY_ISSUER, configured: false }
  const [rows] = await adminDb.batch([
    { text: `SELECT issuer_profile FROM admin_settings WHERE id = true LIMIT 1`, params: [] },
  ])
  const raw = (rows[0] as { issuer_profile: unknown } | undefined)?.issuer_profile
  const parsed = issuerProfileSchema.safeParse(raw)
  return parsed.success ? { profile: parsed.data, configured: true } : { profile: EMPTY_ISSUER, configured: false }
}

export async function saveIssuerProfile(profile: IssuerProfile): Promise<void> {
  await sql`
    INSERT INTO admin_settings (id, issuer_profile, updated_at)
    VALUES (true, ${JSON.stringify(profile)}::jsonb, now())
    ON CONFLICT (id) DO UPDATE SET issuer_profile = EXCLUDED.issuer_profile, updated_at = now()
  `
}

/** Chyby, které databáze hlásí vlastním jménem — ať je uživatel pozná česky. */
export function issueErrorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  if (message.includes('admin_invoice_sequence_full')) {
    return 'Řada faktur pro letošek je plná (999 faktur). Napište mi, založím další řadu.'
  }
  if (message.includes('admin_invoice_amount_mismatch')) {
    return 'Částka nesedí na položky. Zkontrolujte počty a ceny.'
  }
  if (message.includes('admin_invoice_locked')) {
    return 'Vystavenou fakturu už nejde měnit. Udělejte storno a vystavte novou.'
  }
  if (message.includes('admin_invoice_items')) return 'Faktura musí mít aspoň jednu položku, nejvíc padesát.'
  if ((err as { code?: string })?.code === '23505') return 'Tohle číslo faktury už v evidenci je.'
  return 'Fakturu se nepodařilo vystavit. Zkuste to prosím znovu.'
}

export type IssueResult = { id: string; number: string }

/**
 * Vystaví fakturu a vrátí její číslo. Profil dodavatele se na doklad uloží
 * jako **snímek** — pozdější změna profilu starší faktury nepřepíše.
 */
export async function issueInvoice(input: IssueInvoiceInput, issuer: IssuerProfile): Promise<IssueResult> {
  const amount = invoiceTotal(input.items)

  const payload = {
    project_id: input.projectId,
    client_name: input.counterparty.name,
    client_ico: input.counterparty.ico,
    client_dic: input.counterparty.dic,
    client_address: input.counterparty.address,
    issued_on: input.issuedOn,
    supplied_on: input.suppliedOn,
    due_on: input.dueOn,
    currency: input.currency,
    note: input.note,
    amount,
    items: input.items,
    issuer,
  }

  // Dva příkazy schválně: řádek vložený funkcí ještě není vidět ve snímku
  // téhož dotazu, takže `JOIN invoices` by vrátil prázdno.
  const issued = await sql`SELECT admin_invoice_issue(${JSON.stringify(payload)}::jsonb)::text AS id`
  const id = (issued[0] as { id: string } | undefined)?.id
  if (!id) throw new Error('admin_invoice_missing')

  const rows = await sql`SELECT invoice_number FROM invoices WHERE id = ${id} LIMIT 1`
  const number = (rows[0] as { invoice_number: string } | undefined)?.invoice_number
  if (!number) throw new Error('admin_invoice_missing')
  return { id, number }
}

/**
 * Storno. Vystavený doklad se nepřepisuje (trigger v migraci 107), takže
 * oprava znamená zrušit tenhle a vystavit nový. Zaplacení se přitom vrací
 * zpět, aby stornovaná faktura nezůstala v ledgeru jako příjem.
 */
/** Storno dokladu. Dotaz, ne provedení — jde do jedné dávky se srovnáním ledgeru (AD13). */
export function cancelInvoiceQuery(id: string): AdminQuery {
  return {
    text: `UPDATE invoices SET paid_on = NULL, cancelled_at = now() WHERE id = $1 AND number_seq IS NOT NULL`,
    params: [id],
  }
}

export async function cancelInvoice(id: string): Promise<void> {
  await adminDb.batch([cancelInvoiceQuery(id)])
}

// ─── Předvyplnění ────────────────────────────────────────────────────────────

/**
 * Kořen kontaktu zakázky. Sloučený kontakt (AD09) ukazuje na toho, do koho byl
 * sloučen; řetěz je vždy plochý (R-095), takže stačí jeden skok. Funkce
 * `contacts_root` se schválně nepoužívá — předvyplnění má fungovat i na
 * databázi, kde migrace 104 teprve čeká.
 */
const CONTACT_ROOT = `coalesce((SELECT cc.merged_into FROM contacts cc WHERE cc.id = p.contact_id), p.contact_id)`

export type IssueDraft = {
  issuedOn: string
  suppliedOn: string
  dueOn: string
  counterparty: { name: string; address: string; ico: string; dic: string }
  /** Cena ze zakázky mínus zaplacená záloha; 0 = nic k předvyplnění. */
  amount: number
  projectId: string | null
  projectLabel: string | null
}

/**
 * Co jde vyplnit za uživatele: datum, splatnost +14 dní, odběratel z poslední
 * faktury téhož kontaktu (AD09) a částka ze zakázky po odečtení zálohy.
 * Nic z toho není závazné — všechno jde ve formuláři přepsat.
 */
export async function loadIssueDraft(projectId: string | null): Promise<IssueDraft> {
  const today = getPragueTodayISO()
  const draft: IssueDraft = {
    issuedOn: today,
    suppliedOn: today,
    dueOn: addIsoDays(today, DEFAULT_DUE_DAYS),
    counterparty: { name: '', address: '', ico: '', dic: '' },
    amount: 0,
    projectId,
    projectLabel: null,
  }
  if (!projectId) return draft

  const [projectRows, invoiceRows] = await adminDb.batch([
    {
      text: `
        SELECT p.client_name, p.description, p.price::float AS price,
               p.deposit_amount::float AS deposit_amount, p.deposit_paid,
               c.ico AS contact_ico, c.dic AS contact_dic, c.company AS contact_company
        FROM projects p
        LEFT JOIN contacts c ON c.id = ${CONTACT_ROOT}
        WHERE p.id = $1
        LIMIT 1
      `,
      params: [projectId],
    },
    {
      // Poslední doklad téhož kontaktu: odběratele stačí opsat jednou.
      text: `
        SELECT i.client_name, i.client_ico, i.client_dic, i.client_address
        FROM invoices i
        JOIN projects p ON p.id = i.project_id
        WHERE coalesce(${CONTACT_ROOT}, p.id) = (
                SELECT coalesce(${CONTACT_ROOT}, p.id) FROM projects p WHERE p.id = $1
              )
          AND i.client_name IS NOT NULL
        ORDER BY i.issued_on DESC, i.created_at DESC
        LIMIT 1
      `,
      params: [projectId],
    },
  ])

  const project = projectRows[0] as
    | {
        client_name: string
        description: string | null
        price: number | null
        deposit_amount: number | null
        deposit_paid: boolean
        contact_ico: string | null
        contact_dic: string | null
        contact_company: string | null
      }
    | undefined
  if (!project) return draft

  const last = invoiceRows[0] as
    | { client_name: string | null; client_ico: string | null; client_dic: string | null; client_address: string | null }
    | undefined

  const deposit = project.deposit_paid ? project.deposit_amount ?? 0 : 0
  draft.amount = Math.max(0, (project.price ?? 0) - deposit)
  draft.projectLabel = project.description ? `${project.client_name} — ${project.description}` : project.client_name
  draft.counterparty = {
    name: last?.client_name ?? project.contact_company ?? project.client_name,
    address: last?.client_address ?? '',
    ico: last?.client_ico ?? project.contact_ico ?? '',
    dic: last?.client_dic ?? project.contact_dic ?? '',
  }
  return draft
}

// ─── PDF ─────────────────────────────────────────────────────────────────────

export type IssuedInvoiceForPdf = { invoice: PdfInvoice; filename: string }

/**
 * Faktura vystavená v adminu ve tvaru, kterému rozumí sdílený renderer.
 * Archiv (`number_seq IS NULL`) tudy nechodí — ten má vlastní nahrané PDF.
 */
export async function loadIssuedInvoiceForPdf(id: string): Promise<IssuedInvoiceForPdf | null> {
  if (!(await isIssuingReady())) return null
  const [rows] = await adminDb.batch([
    {
      text: `
        SELECT invoice_number, client_name, client_ico, client_dic, client_address,
               issued_on::text, supplied_on::text, due_on::text, paid_on::text,
               cancelled_at, amount::float AS amount, currency, items, issuer, note
        FROM invoices
        WHERE id = $1 AND number_seq IS NOT NULL
        LIMIT 1
      `,
      params: [id],
    },
  ])

  const row = rows[0] as
    | {
        invoice_number: string
        client_name: string | null
        client_ico: string | null
        client_dic: string | null
        client_address: string | null
        issued_on: string
        supplied_on: string | null
        due_on: string | null
        paid_on: string | null
        cancelled_at: string | null
        amount: number
        currency: string
        items: PdfInvoice['items']
        issuer: IssuerProfile
        note: string | null
      }
    | undefined
  if (!row) return null

  const invoice: PdfInvoice = {
    number: row.invoice_number,
    issuer: {
      name: row.issuer.name,
      address: row.issuer.address,
      ico: row.issuer.ico,
      dic: row.issuer.dic,
      bank: row.issuer.bank,
      vatPayer: row.issuer.vatPayer,
    },
    counterparty: {
      name: row.client_name ?? '',
      address: row.client_address ?? '',
      ico: row.client_ico,
      dic: row.client_dic,
    },
    issuedOn: row.issued_on,
    suppliedOn: row.supplied_on ?? row.issued_on,
    dueOn: row.due_on ?? row.issued_on,
    paidOn: row.paid_on,
    amount: row.amount,
    currency: row.currency === 'EUR' ? 'EUR' : 'CZK',
    items: row.items ?? [],
    note: row.note ?? '',
    payable: row.paid_on === null && row.cancelled_at === null,
    cancelled: row.cancelled_at !== null,
  }

  return { invoice, filename: `faktura-${row.invoice_number}.pdf` }
}
