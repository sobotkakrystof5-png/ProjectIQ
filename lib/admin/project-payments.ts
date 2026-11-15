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

/** SQL výraz: co ze zakázky ještě zbývá zaplatit (nikdy pod nulu). */
export function remainingSql(ref = 'p'): string {
  return `GREATEST(
    COALESCE(${ref}.price, 0)
    - CASE WHEN ${ref}.deposit_paid THEN COALESCE(${ref}.deposit_amount, 0) ELSE 0 END
    - ${extraDepositsSql(ref)},
    0)`
}

/** Součet ručně zapsaných záloh k jedné zakázce. */
export async function extraDepositsFor(projectId: string): Promise<number> {
  const [rows] = await adminDb.batch([
    {
      text: `SELECT ${extraDepositsSql('p')}::float AS total FROM projects p WHERE p.id = $1`,
      params: [projectId],
    },
  ])
  return Number((rows[0] as { total?: number } | undefined)?.total ?? 0)
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
}): number {
  const price = Number(input.price ?? 0)
  const own = input.depositPaid ? Number(input.depositAmount ?? 0) : 0
  return Math.max(0, Math.round((price - own - input.extraDeposits) * 100) / 100)
}
