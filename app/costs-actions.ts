'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { requireAuth } from '@/lib/auth'
import { adminDb, type AdminQuery } from '@/lib/admin/db'
import { ledgerSql, withLedger } from '@/lib/admin/ledger'
import { getPragueTodayISO } from '@/lib/prague-time'
import type { Cost, CostType, CostCategory } from '@/lib/types'

export type CostPayload = {
  name: string
  amount: number
  cost_type: CostType
  category: CostCategory
  description: string | null
  project_id: string | null
}

function revalidateCostPaths(projectId: string | null) {
  revalidatePath('/dashboard/naklady')
  revalidatePath('/dashboard/profil')
  revalidatePath('/dashboard/finance')
  if (projectId) revalidatePath(`/dashboard/${projectId}`)
}

const COST_COLUMNS = `
  id::text, name, amount::float AS amount, cost_type, category, description,
  project_id::text, source_finance_transaction_id::text, created_at::text
`

/**
 * Náklady pro přehled ve Financích. Strop 500 je v praxi „všechno" (nákladů
 * jsou desítky) — jen aby v adminu nezůstal výpis, který roste bez konce (AD07).
 * Obrazovka Náklady si bere stránky přes `lib/admin/costs.ts`.
 *
 * Archivovaný náklad (AD13) ve výpisu není: už neběží, ale jeho historie
 * v ledgeru zůstává.
 */
export async function getCosts(): Promise<Cost[]> {
  await requireAuth()
  const [rows] = await withLedger((L) =>
    adminDb.batch([
      {
        text: `
          SELECT ${COST_COLUMNS}
          FROM costs
          WHERE ${L.costsActive()}
          ORDER BY cost_type, created_at DESC
          LIMIT 500
        `,
        params: [],
      },
    ]),
  )
  return rows as unknown as Cost[]
}

/**
 * Náklady jedné zakázky — pro panel na detailu zakázky. Zdroj pravdy pro
 * Náklady u probíhajících zakázek (na rozdíl od `estimated_costs`, což
 * je jen orientační odhad při zakládání).
 */
export async function getProjectCosts(projectId: string): Promise<Cost[]> {
  await requireAuth()
  const [rows] = await withLedger((L) =>
    adminDb.batch([
      {
        text: `
          SELECT ${COST_COLUMNS}
          FROM costs
          WHERE project_id = $1 AND ${L.costsActive()}
          ORDER BY created_at DESC
        `,
        params: [projectId],
      },
    ]),
  )
  return rows as unknown as Cost[]
}

export async function createCost(payload: CostPayload) {
  await requireAuth()
  const L = await ledgerSql()
  const today = getPragueTodayISO()
  // Id se generuje tady, aby náklad i jeho výdaj šly do jedné dávky —
  // náklad bez výdaje (nebo naopak) je rozbitá evidence.
  const id = randomUUID()
  const lifecycle = L.has ? ', starts_on, incurred_on' : ''
  const lifecycleValues = L.has ? `, $8::date, CASE WHEN $4 = 'one_time' THEN $8::date END` : ''

  const queries: AdminQuery[] = [
    {
      text: `
        INSERT INTO costs (id, name, amount, cost_type, category, description, project_id${lifecycle})
        VALUES ($1, $2, $3, $4, $5, $6, $7${lifecycleValues})
      `,
      params: [
        id, payload.name, payload.amount, payload.cost_type, payload.category,
        payload.description, payload.project_id, ...(L.has ? [today] : []),
      ],
    },
  ]

  // Jednorázové náklady → okamžitě do financí. Datum je pražský dnešek,
  // ne `now()::date` (to je v UTC a po půlnoci o den vedle).
  if (payload.cost_type === 'one_time' && payload.amount > 0) {
    queries.push({
      text: `
        INSERT INTO finance_transactions (amount, type, category, note, date, user_id, source_cost_id)
        VALUES ($1, 'expense', 'náklady', $2, $3::date, NULL, $4)
      `,
      params: [payload.amount, payload.name, today, id],
    })
  }

  await adminDb.batch(queries)
  revalidateCostPaths(payload.project_id)
  return { id }
}

/**
 * Úprava nákladu. **Historii nemaže** (AD13).
 *
 * Do AD13 končila tahle funkce větví `DELETE FROM finance_transactions
 * WHERE source_cost_id = …`, takže jakákoli editace fixního nákladu — i pouhé
 * přejmenování — smazala **všechny** jeho vygenerované měsíční výdaje a cron
 * pak dogeneroval jen ten aktuální. Z nákladu, který platil tři roky, zbyl
 * jeden měsíc a přehledy i zisk zakázek tím tiše zlevnily.
 *
 * Nové pravidlo:
 *   - přejmenování přepíše popis **všech** záznamů (je to tentýž náklad),
 *   - změna částky platí **od aktuální periody dál**; co už bylo zaplaceno,
 *     se nepřepisuje,
 *   - jednorázový náklad má svůj jediný záznam (bez periody) jako dřív.
 */
export async function updateCost(id: string, payload: CostPayload) {
  await requireAuth()
  const L = await ledgerSql()
  const today = getPragueTodayISO()
  const jednorazovy = payload.cost_type === 'one_time'
  // Měsíční periody jsou 'YYYY-MM', roční 'YYYY' — porovnávají se v rámci
  // svého druhu, takže řetězec stačí.
  const odPeriody = payload.cost_type === 'fixed_annual' ? today.slice(0, 4) : today.slice(0, 7)

  const queries: AdminQuery[] = [
    {
      text: `
        UPDATE costs SET
          name = $2, amount = $3, cost_type = $4, category = $5, description = $6, project_id = $7
        WHERE id = $1
      `,
      params: [id, payload.name, payload.amount, payload.cost_type, payload.category, payload.description, payload.project_id],
    },
    // Popis se mění vždy a všude: je to pořád tentýž náklad.
    {
      text: `UPDATE finance_transactions SET note = $2 WHERE source_cost_id = $1`,
      params: [id, payload.name],
    },
  ]

  if (jednorazovy && payload.amount > 0) {
    // Upsert jediného záznamu bez periody. Vygenerovanou historii se
    // nedotkne — ta má `recurring_period` vyplněné.
    queries.push({
      text: `
        WITH uprava AS (
          UPDATE finance_transactions SET amount = $2, note = $3
          WHERE source_cost_id = $1 AND recurring_period IS NULL
          RETURNING id
        )
        INSERT INTO finance_transactions (amount, type, category, note, date, user_id, source_cost_id)
        SELECT $2, 'expense', 'náklady', $3, $4::date, NULL, $1
        WHERE NOT EXISTS (SELECT 1 FROM uprava)
      `,
      params: [id, payload.amount, payload.name, today],
    })
  } else if (jednorazovy) {
    // Nulová částka → záznam nemá co evidovat. Mizí jen ten jednorázový.
    queries.push({
      text: `DELETE FROM finance_transactions WHERE source_cost_id = $1 AND recurring_period IS NULL`,
      params: [id],
    })
  } else {
    // Fixní náklad: nová částka platí od aktuální periody dál.
    queries.push({
      text: `
        UPDATE finance_transactions SET amount = $2
        WHERE source_cost_id = $1
          AND recurring_period IS NOT NULL
          AND recurring_period >= $3
      `,
      params: [id, payload.amount, odPeriody],
    })
    if (L.has) {
      // Náklad znovu běží od dneška, pokud byl mezitím ukončený.
      queries.push({
        text: `UPDATE costs SET archived_at = NULL WHERE id = $1 AND archived_at IS NOT NULL`,
        params: [id],
      })
    }
  }

  await adminDb.batch(queries)
  revalidateCostPaths(payload.project_id)
}

/**
 * Smazání nákladu. Náklad **s historií** v ledgeru se nemaže, jen ukončí
 * (AD13): výdaje za uplynulé měsíce jsou skutečné peníze a patří do daňové
 * evidence i do zisku zakázky. Dřív mizely spolu s nákladem.
 */
export async function deleteCost(
  id: string,
  projectId: string | null = null,
): Promise<{ archived: boolean }> {
  await requireAuth()
  const L = await ledgerSql()
  const today = getPragueTodayISO()
  const maHistorii = `EXISTS (
    SELECT 1 FROM finance_transactions t
    WHERE t.source_cost_id = $1 AND t.recurring_period IS NOT NULL
  )`

  if (!L.has) {
    // Před migrací 109 není kam ukončení zapsat — chová se to jako dřív.
    await adminDb.batch([
      { text: `DELETE FROM finance_transactions WHERE source_cost_id = $1`, params: [id] },
      { text: `DELETE FROM costs WHERE id = $1`, params: [id] },
    ])
    revalidateCostPaths(projectId)
    return { archived: false }
  }

  const [archivace] = await adminDb.batch([
    {
      text: `
        UPDATE costs SET archived_at = now(), ends_on = COALESCE(ends_on, $2::date)
        WHERE id = $1 AND ${maHistorii}
        RETURNING id::text AS id
      `,
      params: [id, today],
    },
    // Jednorázový výdaj (bez periody) patří k nákladu jako jeden celek.
    {
      text: `DELETE FROM finance_transactions WHERE source_cost_id = $1 AND recurring_period IS NULL`,
      params: [id],
    },
    {
      text: `DELETE FROM costs WHERE id = $1 AND NOT ${maHistorii}`,
      params: [id],
    },
  ])

  revalidateCostPaths(projectId)
  return { archived: archivace.length > 0 }
}
