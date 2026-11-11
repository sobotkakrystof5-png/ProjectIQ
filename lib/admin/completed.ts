import 'server-only'
import { adminDb, type AdminQuery } from './db'
import type { TableParams } from '@/lib/admin-table'
import type { CompletedProject, ProjectSurvey, ProjectType } from '@/lib/types'

/**
 * Dokončené zakázky a hodnocení pro obrazovky `/dashboard/{dokoncene,hodnoceni}` (AD07).
 *
 * Dřív se obě obrazovky ptaly `SELECT * FROM completed_projects` bez `LIMIT`
 * a filtrovaly a řadily až v prohlížeči. Tady se řadí, stránkuje a počítá
 * v databázi a všechno jde na **jedno kolo** (`adminDb.batch`).
 *
 * `params.orderBy` je složené jen z `COMPLETED_SORT`, proto smí jít do textu
 * dotazu; hodnoty z adresy se do SQL nedostanou (viz `lib/admin-table.ts`).
 */

/** Povolené řazení: klíč v URL → sloupec. */
export const COMPLETED_SORT = {
  nazev: { sql: 'title', dir: 'asc' as const },
  klient: { sql: 'coalesce(client_name, company)', dir: 'asc' as const },
  datum: { sql: 'completed_at', dir: 'desc' as const },
  castka: { sql: 'amount', dir: 'desc' as const },
  zaloha: { sql: 'deposit_amount', dir: 'desc' as const },
  narocnost: { sql: 'difficulty', dir: 'desc' as const },
  cas: { sql: 'time_invested', dir: 'desc' as const },
  odhad: { sql: 'estimated_hours', dir: 'desc' as const },
}

/**
 * Strop pro přehled výkonnosti a hodnocení. Není to výpis, ale průměry —
 * přesto nechodí „všechno": tisíc dokončených zakázek je o řád víc, než kolik
 * jich za celou dobu vzniklo, a bez stropu by obrazovka rostla donekonečna.
 */
const STATS_LIMIT = 1000

const STATS_COLUMNS = `id::text, title, amount::float AS amount, completed_at,
  difficulty, time_invested::float AS time_invested,
  estimated_hours::float AS estimated_hours, project_type`

const SURVEY_COLUMNS = `id::text, completed_project_id::text, rating_cooperation, rating_speed,
  rating_design, rating_functionality, rating_reliability, rating_flexibility,
  reference_text, consent, created_at`

const ROW_COLUMNS = `id::text, title, client_name, company, completed_at,
  amount::float AS amount, deposit_amount::float AS deposit_amount, difficulty,
  time_invested::float AS time_invested, estimated_hours::float AS estimated_hours,
  notes, project_type, survey_token, client_email, source_project_id::text, created_at`

export type CompletedScreen = {
  rows: CompletedProject[]
  total: number
  counts: Record<ProjectType, number>
  stats: CompletedProject[]
  surveys: ProjectSurvey[]
}

/** Stránka tabulky + čísla do přepínače + podklady pro přehled výkonnosti. */
export async function loadCompletedScreen(type: ProjectType, params: TableParams): Promise<CompletedScreen> {
  const page: AdminQuery = {
    text: `SELECT ${ROW_COLUMNS} FROM completed_projects
           WHERE project_type = $1
           ${params.orderBy}
           LIMIT $2 OFFSET $3`,
    params: [type, params.limit, params.offset],
  }
  const counts: AdminQuery = {
    text: `SELECT project_type, count(*)::int AS pocet FROM completed_projects GROUP BY project_type`,
    params: [],
  }
  const stats: AdminQuery = {
    text: `SELECT ${STATS_COLUMNS} FROM completed_projects ORDER BY completed_at DESC LIMIT $1`,
    params: [STATS_LIMIT],
  }
  const surveys: AdminQuery = {
    text: `SELECT ${SURVEY_COLUMNS} FROM project_surveys ORDER BY created_at DESC LIMIT $1`,
    params: [STATS_LIMIT],
  }

  const [pageRows, countRows, statsRows, surveyRows] = await adminDb.batch([page, counts, stats, surveys])
  const byType = { client: 0, personal: 0 } as Record<ProjectType, number>
  for (const row of countRows) {
    const key = row.project_type as ProjectType
    if (key in byType) byType[key] = Number(row.pocet)
  }

  return {
    rows: pageRows as unknown as CompletedProject[],
    total: byType[type] ?? 0,
    counts: byType,
    stats: statsRows as unknown as CompletedProject[],
    surveys: surveyRows as unknown as ProjectSurvey[],
  }
}

/** Hodnocení: klientské zakázky a odpovědi z dotazníků, obojí se stropem. */
export async function loadRatingsScreen(): Promise<{ projects: CompletedProject[]; surveys: ProjectSurvey[] }> {
  const [projects, surveys] = await adminDb.batch([
    {
      text: `SELECT ${STATS_COLUMNS}, client_name, company, survey_token, client_email
             FROM completed_projects WHERE project_type = 'client'
             ORDER BY completed_at DESC LIMIT $1`,
      params: [STATS_LIMIT],
    },
    {
      text: `SELECT ${SURVEY_COLUMNS} FROM project_surveys ORDER BY created_at DESC LIMIT $1`,
      params: [STATS_LIMIT],
    },
  ])
  return {
    projects: projects as unknown as CompletedProject[],
    surveys: surveys as unknown as ProjectSurvey[],
  }
}
