import 'server-only'
import { adminDb, type AdminRow } from './db'
import { normalizeSurvey, type SurveyWithProject } from '@/lib/admin/survey-model'
import type { ClosedProject } from '@/lib/types'

/**
 * Uzavřené zakázky a hodnocení pro přehled na `/dashboard/profil` (AD11).
 *
 * Nahrazuje `lib/admin/completed.ts`: dřív se četla tabulka `completed_projects`,
 * která byla kopií zakázky s vlastní cenou. Od migrace 106 je zdrojem **zakázka**
 * (`closed_at IS NOT NULL`) a nic se nekopíruje — `title` je její popis,
 * `amount` její cena.
 */

/**
 * Strop pro přehled. Není to výpis, ale průměry — přesto nechodí „všechno":
 * tisíc uzavřených zakázek je o řád víc, než kolik jich za celou dobu vzniklo,
 * a bez stropu by obrazovka rostla donekonečna.
 */
const STATS_LIMIT = 1000

/** Zakázka v tom tvaru, v jakém ji čeká přehled výkonnosti. */
export const CLOSED_COLUMNS = `id::text,
  coalesce(nullif(btrim(coalesce(description, '')), ''), client_name) AS title,
  client_name, company, closed_at,
  coalesce(price, 0)::float AS amount, deposit_amount::float AS deposit_amount,
  difficulty, time_invested::float AS time_invested,
  estimated_hours::float AS estimated_hours, project_type,
  survey_token::text, client_email,
  -- Razítka dotazníku (AD16) přes to_jsonb, ne přímo: bez migrace 112
  -- sloupce neexistují a přímý odkaz by shodil celý přehled. Takhle vyjde
  -- NULL a obrazovka se chová jako dřív.
  to_jsonb(projects) ->> 'survey_requested_at' AS survey_requested_at,
  to_jsonb(projects) ->> 'survey_reminded_at'  AS survey_reminded_at`

/**
 * Odpověď na dotazník i se zakázkou, ke které patří (R-119). Celý řádek přes
 * `to_jsonb`, ať přehled funguje i bez migrace 118 — chybějící sloupec je
 * v `normalizeSurvey` prostě `null`. Zakázka nemusí být uzavřená: dotazník
 * odchází i při stavu Hotovo nebo Zaplaceno.
 */
const SURVEY_COLUMNS = `to_jsonb(s) AS row,
  coalesce(nullif(btrim(coalesce(p.description, '')), ''), p.client_name) AS project_title,
  p.client_name, p.client_email, to_jsonb(p) ->> 'client_phone' AS client_phone`

function toSurvey(row: AdminRow): SurveyWithProject {
  return {
    ...normalizeSurvey(row.row as Record<string, unknown>),
    project_title: String(row.project_title ?? ''),
    client_name: (row.client_name as string | null) ?? null,
    client_email: (row.client_email as string | null) ?? null,
    client_phone: (row.client_phone as string | null) ?? null,
  }
}

export type PerformanceScreen = {
  projects: ClosedProject[]
  surveys: SurveyWithProject[]
}

/** Podklady pro „Jak se mi daří" a souhrn hodnocení — jedno kolo do databáze. */
export async function loadPerformanceScreen(): Promise<PerformanceScreen> {
  const [projectRows, surveyRows] = await adminDb.batch([
    {
      text: `SELECT ${CLOSED_COLUMNS} FROM projects
             WHERE closed_at IS NOT NULL AND NOT lead_pending
             ORDER BY closed_at DESC LIMIT $1`,
      params: [STATS_LIMIT],
    },
    {
      // Hodnocení bez zakázky (archivní řádek, ke kterému se zakázka nedohledala)
      // v přehledu nedává smysl — nejde u něj říct, čeho se týká.
      text: `SELECT ${SURVEY_COLUMNS} FROM project_surveys s
             JOIN projects p ON p.id = s.project_id
             ORDER BY s.created_at DESC LIMIT $1`,
      params: [STATS_LIMIT],
    },
  ])

  return {
    projects: projectRows as unknown as ClosedProject[],
    surveys: surveyRows.map(toSurvey),
  }
}
