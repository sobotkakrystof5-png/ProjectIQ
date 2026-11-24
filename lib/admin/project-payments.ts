import 'server-only'
import { adminDb } from './db'

/**
 * Zálohy zapsané ručně z Finance › Podnikání (R-110).
 *
 * Zakázka má od začátku jednu „vlastní" zálohu (`projects.deposit_amount`
 * + `deposit_paid`), kterou do ledgeru zapisuje sama (`income_origin =
 * 'project'`, nejvýš jedna — index z migrace 109). Klient ale často platí
 * po částech, a proto jde k zakázce zapsat libovolně dalších záloh. Jsou to
 * obyčejné příjmy v `finance_transactions`, poznají se podle kategorie
 * `záloha` a vazby `source_project_id`.
 *
 * Zbývá doplatit = cena − vlastní záloha (je-li zaplacená) − tyhle zálohy.
 * Stejný výpočet musí platit všude, kde se doplatek počítá: doplatek při
 * označení „Peníze dorazily", „Nezaplacené zakázky" v Podnikání, souhrn ve
 * výpisu zakázek i předvyplněná částka faktury. Jinak by se tytéž peníze
 * započítaly dvakrát.
 *
 * Na kategorii, ne na `income_origin`: ten je z migrace 109 a kategorie
 * funguje i na databázi bez ní.
 *
 * **Od R-125 (KP13) se odečítají i zaplacené faktury zakázky.** Dřív
 * zaplacená faktura „zbývá doplatit" nesnížila — vynuloval ho až klik
 * „Peníze dorazily" u zakázky, zatímco průvodka už fakturu brala jako
 * zaplacenou. Klient v prostoru (`portal.project_money`, migrace 122) vidí
 * tatáž čísla, a proto tentýž výpočet běží i v databázi
 * (`portal.refresh_project_money`). Změnu jednoho je potřeba udělat i ve
 * druhém — hlídá to test `kp13-penize-faktury`.
 *
 * Počítá se jen příjem, který faktura **sama založila** (`source_invoice_id`).
 * Když faktura převzala už zapsanou zálohu nebo doplatek (stejná částka,
 * `syncInvoiceTransaction` krok 6), jsou to tytéž peníze a jsou už započtené
 * výš. Jen koruny: cena zakázky je v korunách a eurová faktura se k ní
 * nepřičítá (měny se nesčítají, R-011).
 */

/** Kategorie ručně zapsané zálohy k zakázce. */
export const EXTRA_DEPOSIT_CATEGORY = 'záloha'
/** Kategorie jednorázového příjmu z podnikání bez zakázky. */
export const ONE_OFF_INCOME_CATEGORY = 'jednorázový příjem'

/**
 * SQL výraz: součet ručně zapsaných záloh k zakázce. `ref` je odkaz na řádek
 * zakázky (`p`, nebo `projects` bez aliasu). Do textu jde jen konstanta.
 */
export function extraDepositsSql(ref = 'p'): string {
  return `COALESCE((
    SELECT SUM(zt.amount) FROM finance_transactions zt
    WHERE zt.source_project_id = ${ref}.id
      AND zt.type = 'income'
      AND zt.user_id IS NULL
      AND zt.category = '${EXTRA_DEPOSIT_CATEGORY}'
  ), 0)`
}

/**
 * SQL výraz: zaplacené korunové faktury zakázky — jen příjem, který faktura
 * v ledgeru sama založila (R-125). Storno vynuluje `paid_on`, takže
 * stornovaná faktura tu není.
 */
export function invoicePaymentsSql(ref = 'p'): string {
  return `COALESCE((
    SELECT SUM(ft.amount) FROM finance_transactions ft
    JOIN invoices fi ON fi.id = ft.source_invoice_id
    WHERE fi.project_id = ${ref}.id
      AND fi.paid_on IS NOT NULL
      AND fi.currency = 'CZK'
      AND ft.type = 'income'
      AND ft.user_id IS NULL
  ), 0)`
}

/**
 * SQL výraz: co ze zakázky ještě zbývá zaplatit (nikdy pod nulu). Zaplacená
 * zakázka („Peníze dorazily") nezbývá nic — stejně jako SQL kopie
 * `portal.refresh_project_money` v migraci 122 (R-125, audit 2026-11-24 #4).
 */
export function remainingSql(ref = 'p'): string {
  return `CASE WHEN COALESCE(${ref}.paid, false) THEN 0 ELSE GREATEST(
    COALESCE(${ref}.price, 0)
    - CASE WHEN ${ref}.deposit_paid THEN COALESCE(${ref}.deposit_amount, 0) ELSE 0 END
    - ${extraDepositsSql(ref)}
    - ${invoicePaymentsSql(ref)},
    0) END`
}

export type ProjectPayments = { extraDeposits: number; invoicePayments: number }

/** Ručně zapsané zálohy a zaplacené faktury jedné zakázky — jedním dotazem. */
export async function projectPaymentsFor(projectId: string): Promise<ProjectPayments> {
  const [rows] = await adminDb.batch([
    {
      text: `SELECT ${extraDepositsSql('p')}::float AS extra, ${invoicePaymentsSql('p')}::float AS invoices
             FROM projects p WHERE p.id = $1`,
      params: [projectId],
    },
  ])
  const row = rows[0] as { extra?: number; invoices?: number } | undefined
  return { extraDeposits: Number(row?.extra ?? 0), invoicePayments: Number(row?.invoices ?? 0) }
}

export type OpenProjectOption = {
  id: string
  label: string
  remaining: number
  /** Fakturováno na IČO — záloha půjde do přiznané linie. */
  declared: boolean
}

export type ManualPayment = {
  id: string
  kind: 'zaloha' | 'jednorazovy'
  amount: number
  date: string
  note: string | null
  declared: boolean
  projectId: string | null
  projectLabel: string | null
}

export type BusinessPaymentsPanel = {
  projects: OpenProjectOption[]
  payments: ManualPayment[]
}

/** Data pro „Zapsat příjem" v Podnikání: kam jde záloha a co už je zapsané. */
export async function loadBusinessPaymentsPanel(year: number): Promise<BusinessPaymentsPanel> {
  const [projectRows, paymentRows] = await adminDb.batch([
    {
      text: `
        SELECT p.id::text, p.client_name, p.description, p.invoiced_on_ico AS declared,
               ${remainingSql('p')}::float AS remaining
        FROM projects p
        WHERE NOT p.lead_pending
          AND p.paid = false
          AND p.price > 0
          AND ${remainingSql('p')} > 0
        ORDER BY p.updated_at DESC
        LIMIT 200
      `,
      params: [],
    },
    {
      text: `
        SELECT t.id::text, t.category, t.amount::float AS amount, t.date::text AS date, t.note, t.declared,
               t.source_project_id::text AS project_id, p.client_name, p.description
        FROM finance_transactions t
        LEFT JOIN projects p ON p.id = t.source_project_id
        WHERE t.user_id IS NULL
          AND t.type = 'income'
          AND t.category IN ('${EXTRA_DEPOSIT_CATEGORY}', '${ONE_OFF_INCOME_CATEGORY}')
          AND EXTRACT(YEAR FROM t.date) = $1
        ORDER BY t.date DESC, t.created_at DESC
        LIMIT 50
      `,
      params: [year],
    },
  ])

  const label = (name: unknown, description: unknown) =>
    description ? `${String(name)} — ${String(description)}` : String(name ?? 'Bez jména')

  return {
    projects: projectRows.map((r) => ({
      id: String(r.id),
      label: label(r.client_name, r.description),
      remaining: Number(r.remaining),
      declared: Boolean(r.declared),
    })),
    payments: paymentRows.map((r) => ({
      id: String(r.id),
      kind: r.category === EXTRA_DEPOSIT_CATEGORY ? 'zaloha' : 'jednorazovy',
      amount: Number(r.amount),
      date: String(r.date).slice(0, 10),
      note: (r.note as string | null) ?? null,
      declared: Boolean(r.declared),
      projectId: (r.project_id as string | null) ?? null,
      projectLabel: r.project_id ? label(r.client_name, r.description) : null,
    })),
  }
}

/** Čistý výpočet doplatku — sdílí ho zakázka i testy. */
export function remainingToPay(input: {
  price: number | null
  depositAmount: number | null
  depositPaid: boolean
  extraDeposits: number
  /** Zaplacené korunové faktury zakázky (R-125). */
  invoicePayments?: number
  /** „Peníze dorazily" — zaplacená zakázka nezbývá nic. */
  paid?: boolean
}): number {
  if (input.paid) return 0
  const price = Number(input.price ?? 0)
  const own = input.depositPaid ? Number(input.depositAmount ?? 0) : 0
  const paid = own + input.extraDeposits + (input.invoicePayments ?? 0)
  return Math.max(0, Math.round((price - paid) * 100) / 100)
}
