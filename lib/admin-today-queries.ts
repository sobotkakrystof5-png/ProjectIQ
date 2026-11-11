import { sql } from '@/lib/db'
import { projectPath } from '@/lib/lead-origins'
import { getPragueTodayISO } from '@/lib/prague-time'
import { calculateTax } from '@/lib/tax'
import { STALE_AFTER_DAYS, type MonthMoney, type TodayData, type UnpaidInvoiceLine } from '@/lib/admin-today'

const iso = (value: Date | string): string => new Date(value).toISOString()

/**
 * Datum z Postgresu jako YYYY-MM-DD. Sloupec `date` vrací Neon jako Date
 * (místní půlnoc), takže `String(date)` dá „Thu Nov 12 2026…" a složený
 * ISO řetězec by byl neplatný — Dnes na tom padalo s chybou 500.
 */
const dateOnly = (value: Date | string): string =>
  value instanceof Date
    ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
    : String(value).slice(0, 10)

/** Dotaz na tabulku, která vzniká pozdější migrací: bez ní vrátí prázdný seznam. */
const optional = <T,>(query: PromiseLike<T[]>): Promise<T[]> => Promise.resolve(query).catch(() => [])

/** Data pro Dnes: každá sekce se načítá samostatně a jedna chyba nesmí shodit celou stránku. */
export async function loadTodayData(): Promise<TodayData> {
  const [requests, drafts, invoices, slots, calls, stale] = await Promise.all([
    optional(sql`
      SELECT r.id, r.ai_summary, r.created_at, p.id AS project_id, p.client_name
      FROM client_requests r JOIN projects p ON p.id = r.project_id
      WHERE r.status = 'new'
      ORDER BY r.created_at ASC LIMIT 20
    `),
    optional(sql`
      SELECT p.id AS project_id, p.client_name,
             count(*)::int AS count, count(*) FILTER (WHERE a.contains_sensitive)::int AS sensitive
      FROM project_activity a JOIN projects p ON p.id = a.project_id
      WHERE a.status = 'draft'
      GROUP BY p.id, p.client_name
      ORDER BY min(a.created_at) ASC LIMIT 20
    `),
    optional(sql`
      SELECT id, invoice_number, client_name, due_on, amount, currency
      FROM invoices
      WHERE paid_on IS NULL AND due_on IS NOT NULL AND due_on < CURRENT_DATE
      ORDER BY due_on ASC LIMIT 10
    `),
    optional(sql`
      SELECT cs.id, cs.scheduled_at AS at, p.client_name, p.id AS project_id
      FROM consultation_slots cs JOIN projects p ON p.id = cs.project_id
      WHERE cs.scheduled_at > now()
      ORDER BY cs.scheduled_at LIMIT 5
    `),
    optional(sql`
      SELECT id, company_name, next_action, next_action_date, next_action_time
      FROM client_leads
      WHERE next_action_date IS NOT NULL AND next_action_date >= CURRENT_DATE
        AND lead_status NOT IN ('converted', 'lost')
      ORDER BY next_action_date, next_action_time NULLS LAST LIMIT 5
    `),
    optional(sql`
      SELECT id, client_name, updated_at
      FROM projects
      WHERE status IN ('new', 'in_progress', 'review')
        AND updated_at < now() - interval '1 day' * ${STALE_AFTER_DAYS}
        AND NOT lead_pending
      ORDER BY updated_at ASC LIMIT 5
    `),
  ])

  return {
    requests: (requests as { id: string; ai_summary: string | null; created_at: string; client_name: string }[]).map((r) => ({
      id: r.id,
      clientName: r.client_name,
      summary: r.ai_summary,
      createdAt: iso(r.created_at),
      href: '/dashboard/pozadavky',
    })),
    drafts: (drafts as { project_id: string; client_name: string; count: number; sensitive: number }[]).map((d) => ({
      projectId: d.project_id,
      clientName: d.client_name,
      count: d.count,
      sensitive: d.sensitive,
      href: `${projectPath(d.project_id)}?zalozka=aktivita`,
    })),
    overdueInvoices: (invoices as { id: string; invoice_number: string; client_name: string | null; due_on: string; amount: number; currency: string }[]).map((i) => ({
      id: i.id,
      number: i.invoice_number,
      clientName: i.client_name,
      dueOn: iso(i.due_on),
      amount: Number(i.amount),
      currency: i.currency,
    })),
    upcoming: [
      ...(slots as { id: string; at: string; client_name: string; project_id: string }[]).map((s) => ({
        id: `slot-${s.id}`,
        at: iso(s.at),
        label: `Konzultace: ${s.client_name}`,
        detail: null,
        href: projectPath(s.project_id),
      })),
      ...(calls as { id: string; company_name: string; next_action: string | null; next_action_date: Date | string; next_action_time: string | null }[]).map((c) => ({
        id: `call-${c.id}`,
        at: iso(`${dateOnly(c.next_action_date)}T${(c.next_action_time ?? '09:00').slice(0, 5)}:00`),
        label: c.company_name,
        detail: c.next_action,
        href: '/dashboard/calls',
      })),
    ].sort((a, b) => a.at.localeCompare(b.at)),
    stale: (stale as { id: string; client_name: string; updated_at: string }[]).map((s) => ({
      id: s.id,
      clientName: s.client_name,
      updatedAt: iso(s.updated_at),
      href: projectPath(s.id),
    })),
  }
}

/**
 * Peníze pro pravý sloupec Dnes (AD03). Stejné údaje jako Finance › Podnikání,
 * jen na jeden pohled: příjem měsíce, z toho přiznaný, nezaplacené faktury,
 * odhad daně a rezerva.
 *
 * Pravidla se nikde nevymýšlejí znovu — příjem má stejné podmínky jako
 * `getBusinessIncome` (`user_id IS NULL`, `type = 'income'`, příznak `declared`),
 * nezaplacená faktura stejné jako `getInvoices` (`paid_on IS NULL`) a daň počítá
 * tatáž `calculateTax` jako kalkulačka. Dvě kola do databáze místo šesti: Dnes
 * je první obrazovka adminu a nemá čekat na seznam faktur, který nikdo nevidí.
 */
export async function loadMonthMoney(todayIso: string = getPragueTodayISO()): Promise<MonthMoney> {
  const month = todayIso.slice(0, 7)
  const year = Number(todayIso.slice(0, 4))

  const [incomeRows, invoiceRows] = await Promise.all([
    optional(sql`
      SELECT
        COALESCE(SUM(amount) FILTER (WHERE to_char(date, 'YYYY-MM') = ${month}), 0)::float AS month_income,
        COALESCE(SUM(amount) FILTER (WHERE to_char(date, 'YYYY-MM') = ${month} AND declared), 0)::float AS month_declared,
        COALESCE(SUM(amount) FILTER (WHERE declared), 0)::float AS year_declared
      FROM finance_transactions
      WHERE user_id IS NULL AND type = 'income' AND EXTRACT(YEAR FROM date) = ${year}
    `),
    optional(sql`
      SELECT currency,
             COALESCE(SUM(amount), 0)::float AS amount,
             COUNT(*)::int AS count,
             COUNT(*) FILTER (WHERE due_on IS NOT NULL AND due_on < CURRENT_DATE)::int AS overdue
      FROM invoices
      WHERE paid_on IS NULL
      GROUP BY currency
      ORDER BY SUM(amount) DESC
    `),
  ])

  const income = (incomeRows as { month_income: number; month_declared: number; year_declared: number }[])[0]
  const yearDeclaredIncome = Number(income?.year_declared ?? 0)
  const tax = calculateTax({ income: yearDeclaredIncome, year })

  return {
    month,
    year,
    income: Number(income?.month_income ?? 0),
    declaredIncome: Number(income?.month_declared ?? 0),
    yearDeclaredIncome,
    unpaidInvoices: (invoiceRows as UnpaidInvoiceLine[]).map((i) => ({
      currency: i.currency,
      amount: Number(i.amount),
      count: i.count,
      overdue: i.overdue,
    })),
    levies: tax.totalLevies,
    monthlyReserve: tax.monthlyReserve,
    ratesYear: tax.ratesYear,
    ratesMatchYear: tax.ratesMatchYear,
  }
}
