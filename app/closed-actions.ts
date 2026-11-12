'use server'

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { sql } from '@/lib/db'
import { getSurveyUrl } from '@/lib/utils'
import { sendBrandedEmail } from '@/lib/email'
import { projectPath } from '@/lib/lead-origins'
import { STATUS_ORDER, type ProjectStatus, type ProjectType } from '@/lib/types'

/**
 * Uzavření zakázky (AD11, R-090). Nahrazuje `app/completed-actions.ts`.
 *
 * Dřív se zakázka při dokončení **zkopírovala** do `completed_projects` —
 * s vlastním názvem, klientem a cenou, které se pak rozcházely s originálem,
 * a s vlastním příjmem, který se mohl započítat podruhé. Od migrace 106 se
 * nic nekopíruje: uzavření je `closed_at` na zakázce a jde ho vzít zpět,
 * protože není co uklízet.
 */

const PROJECTS_PATH = '/dashboard/zakazky'

export type CloseProjectExtra = {
  project_type: ProjectType
  /** Datum uzavření (pražské „YYYY-MM-DD" z formuláře). */
  closed_on: string
  difficulty: number
  time_invested: number | null
  estimated_hours: number | null
  /** Převést odhad nákladů ze zakázky na skutečný náklad. */
  include_costs: boolean
}

export type CloseProjectResult = {
  /** Stav před uzavřením — „Zpět" ho vrátí. */
  previousStatus: ProjectStatus
  /** Odhad nákladů se nepřevedl, protože zakázka už náklady eviduje. */
  skippedCostsDueToExisting: boolean
}

/** Cizí adresa nemá skončit chybou typu z Postgresu (`22P02`) a stavem 500. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`))
}

export async function closeProject(projectId: string, extra: CloseProjectExtra): Promise<CloseProjectResult> {
  await requireAuth()
  if (!UUID.test(projectId)) throw new Error('Zakázka nenalezena')
  if (!isIsoDate(extra.closed_on)) throw new Error('Datum uzavření není platné.')
  if (!Number.isInteger(extra.difficulty) || extra.difficulty < 1 || extra.difficulty > 10) {
    throw new Error('Náročnost musí být číslo od 1 do 10.')
  }
  if (extra.project_type !== 'client' && extra.project_type !== 'personal') {
    throw new Error('Neznámý druh zakázky.')
  }

  const rows = await sql`
    SELECT client_name, client_email, description, status, closed_at, estimated_costs, survey_token
    FROM projects WHERE id = ${projectId} LIMIT 1
  `
  if (!rows.length) throw new Error('Zakázka nenalezena')
  const p = rows[0] as {
    client_name: string
    client_email: string | null
    description: string | null
    status: ProjectStatus
    closed_at: string | null
    estimated_costs: number | null
    survey_token: string
  }
  if (p.closed_at) throw new Error('Tahle zakázka je už uzavřená.')

  const title = p.description || p.client_name

  // Uzavřená zakázka nesmí zůstat „nová" nebo „v řešení"; zaplacená zůstane
  // zaplacená. Cena se tu nijak nemění — peníze řeší faktura a `paid`.
  await sql`
    UPDATE projects SET
      closed_at       = ${extra.closed_on}::date,
      status          = CASE WHEN status = 'paid' THEN 'paid' ELSE 'done' END,
      project_type    = ${extra.project_type},
      difficulty      = ${extra.difficulty},
      time_invested   = ${extra.time_invested},
      estimated_hours = ${extra.estimated_hours},
      updated_at      = now()
    WHERE id = ${projectId}
  `

  // Děkovný e-mail s dotazníkem — jen u klientské zakázky s e-mailem.
  // Odkaz vede na `projects.survey_token` (migrace 106 ho přebrala z archivu,
  // takže starší odeslané odkazy platí dál).
  if (extra.project_type === 'client' && p.client_email) {
    const to = p.client_email
    const token = p.survey_token
    const name = p.client_name
    after(async () => {
      await sendBrandedEmail({
        to,
        subject: 'Děkuji za spolupráci – ZakazIQ',
        heading: 'Děkuji za spolupráci!',
        intro: `Dobrý den, ${name}, zakázka je hotová a moc vám děkuji za spolupráci — byla mi potěšením. Budu rád, když si najdete chvilku a vyplníte krátký dotazník spokojenosti. Pomůže mi to zlepšovat mé služby a zabere jen pár minut. Na konci můžete napsat i referenci, kterou se mnou chcete sdílet.`,
        fields: [{ label: 'Zakázka', value: title }],
        ctas: [{ label: 'Vyplnit dotazník spokojenosti', href: getSurveyUrl(token) }],
      })
    })
  }

  let skippedCostsDueToExisting = false

  if (extra.include_costs && p.estimated_costs && p.estimated_costs > 0) {
    // Zakázka může už mít ručně evidované skutečné náklady (panel na detailu
    // zakázky) — v tom případě je odhad `estimated_costs` zastaralý
    // a přičítat ho navrch by vytvořilo duplicitní součet.
    const existingCosts = await sql`SELECT COUNT(*)::int AS count FROM costs WHERE project_id = ${projectId}`
    const hasExistingCosts = (existingCosts[0] as { count: number }).count > 0

    if (hasExistingCosts) {
      skippedCostsDueToExisting = true
    } else {
      const costName = 'Náklady: ' + title
      const costRows = await sql`
        INSERT INTO costs (name, amount, cost_type, category, description, project_id)
        VALUES (
          ${costName}, ${p.estimated_costs}, ${'one_time'}, ${'client'},
          ${'Předpokládané náklady ze zakázky ' + p.client_name}, ${projectId}
        )
        RETURNING id
      `
      const costId = (costRows[0] as { id: string }).id
      // Provázat s finance transakcí, ať je náklad vidět i v cash flow.
      await sql`
        INSERT INTO finance_transactions (amount, type, category, note, date, user_id, source_cost_id)
        VALUES (${p.estimated_costs}, 'expense', 'náklady', ${costName}, ${extra.closed_on}::date, NULL, ${costId})
      `
      revalidatePath('/dashboard/naklady')
      revalidatePath('/dashboard/finance')
    }
  }

  revalidatePath(PROJECTS_PATH)
  revalidatePath(projectPath(projectId))
  revalidatePath('/dashboard/profil')

  return { previousStatus: p.status, skippedCostsDueToExisting }
}

/**
 * „Zpět" k uzavření. Smaže `closed_at` a vrátí stav, který zakázka měla —
 * nic víc není potřeba, protože se při uzavření nikam nic nekopírovalo.
 *
 * Převedený odhad nákladů **zůstává**: je to skutečný náklad a maže se
 * v Nákladech. UI to říká u tlačítka.
 */
export async function reopenProject(projectId: string, previousStatus: ProjectStatus) {
  await requireAuth()
  if (!UUID.test(projectId)) throw new Error('Zakázka nenalezena')
  if (!STATUS_ORDER.includes(previousStatus)) throw new Error('Neznámý stav zakázky.')
  await sql`
    UPDATE projects SET closed_at = NULL, status = ${previousStatus}, updated_at = now()
    WHERE id = ${projectId}
  `
  revalidatePath(PROJECTS_PATH)
  revalidatePath(projectPath(projectId))
  revalidatePath('/dashboard/profil')
}

export async function deleteProjectSurvey(id: string) {
  await requireAuth()
  if (!UUID.test(id)) throw new Error('Hodnocení nenalezeno')
  const rows = await sql`DELETE FROM project_surveys WHERE id = ${id} RETURNING project_id::text`
  const projectId = (rows[0] as { project_id: string | null } | undefined)?.project_id
  if (projectId) revalidatePath(projectPath(projectId))
  revalidatePath('/dashboard/profil')
}
