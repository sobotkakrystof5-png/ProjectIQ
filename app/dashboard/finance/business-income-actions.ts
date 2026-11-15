'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import { adminDb } from '@/lib/admin/db'
import { ledgerSql } from '@/lib/admin/ledger'
import {
  EXTRA_DEPOSIT_CATEGORY,
  ONE_OFF_INCOME_CATEGORY,
  remainingSql,
} from '@/lib/admin/project-payments'
import { isIsoDate } from '@/lib/prague-time'

/**
 * Ruční příjmy v Finance › Podnikání (R-110).
 *
 * Dva druhy:
 * - **Záloha k zakázce** — klient zaplatil část. K jedné zakázce jich může
 *   být libovolně; zakázka si je odečte od doplatku (`remainingSql`).
 *   Přiznaná/nepřiznaná linie se bere ze zakázky (`invoiced_on_ico`), aby
 *   peníze jedné zakázky nebyly ve dvou liniích.
 * - **Jednorázový příjem** — peníze, ke kterým žádná zakázka není.
 *
 * Záloha nesmí přesáhnout, kolik ze zakázky zbývá. Hlídá to přímo `INSERT …
 * SELECT … WHERE`, ne „zjisti a pak vlož".
 */

export type BusinessIncomeResult = { ok: true; id: string } | { ok: false; error: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const inputSchema = z
  .object({
    kind: z.enum(['zaloha', 'jednorazovy']),
    amount: z.number().finite().positive('Zadejte částku větší než nula.').max(100_000_000, 'Částka je příliš vysoká.'),
    date: z.string().refine(isIsoDate, 'Vyberte datum platby.'),
    note: z.string().trim().max(300, 'Poznámka může mít nejvýš 300 znaků.').optional().default(''),
    declared: z.boolean().optional().default(false),
    projectId: z.string().regex(UUID).nullable().optional(),
  })
  .refine((v) => v.kind !== 'zaloha' || !!v.projectId, {
    message: 'Vyberte zakázku, ke které záloha patří.',
    path: ['projectId'],
  })

export type BusinessIncomeInput = z.input<typeof inputSchema>

function revalidateMoney(projectId?: string | null) {
  revalidatePath('/dashboard/finance')
  revalidatePath('/dashboard/zakazky')
  revalidatePath('/dashboard/zakazky/dokoncene')
  revalidatePath('/dashboard')
  if (projectId) revalidatePath(`/dashboard/${projectId}`)
}

export async function addBusinessIncome(raw: BusinessIncomeInput): Promise<BusinessIncomeResult> {
  await requireAuth()
  const parsed = inputSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Zkontrolujte vyplněné údaje.' }
  const input = parsed.data
  const L = await ledgerSql()
  const originCol = L.has ? ', income_origin' : ''
  const originVal = L.has ? `, 'manual'` : ''

  try {
    if (input.kind === 'zaloha') {
      const [rows] = await adminDb.batch([
        {
          text: `
            INSERT INTO finance_transactions
              (amount, type, category, note, date, user_id, source_project_id, deposit_transaction, declared, area${originCol})
            SELECT $1, 'income', '${EXTRA_DEPOSIT_CATEGORY}',
                   COALESCE(NULLIF($2, ''), p.client_name || ' — záloha'),
                   $3::date, NULL, p.id, true, p.invoiced_on_ico, 'byznys'${originVal}
            FROM projects p
            WHERE p.id = $4
              AND p.paid = false
              AND ${remainingSql('p')} >= $1
            RETURNING id::text AS id
          `,
          params: [input.amount, input.note, input.date, input.projectId],
        },
      ])
      const id = (rows[0] as { id?: string } | undefined)?.id
      if (!id) {
        return {
          ok: false,
          error: 'Záloha je vyšší, než kolik ze zakázky zbývá doplatit, nebo je zakázka už zaplacená.',
        }
      }
      revalidateMoney(input.projectId)
      return { ok: true, id }
    }

    const [rows] = await adminDb.batch([
      {
        text: `
          INSERT INTO finance_transactions
            (amount, type, category, note, date, user_id, deposit_transaction, declared, area${originCol})
          VALUES ($1, 'income', '${ONE_OFF_INCOME_CATEGORY}', NULLIF($2, ''), $3::date, NULL, false, $4, 'byznys'${originVal})
          RETURNING id::text AS id
        `,
        params: [input.amount, input.note, input.date, input.declared],
      },
    ])
    const id = (rows[0] as { id: string }).id
    revalidateMoney()
    return { ok: true, id }
  } catch (err) {
    console.error('[Podnikání] Příjem se neuložil', err)
    return { ok: false, error: 'Příjem se nepodařilo uložit. Zkuste to prosím znovu.' }
  }
}

/**
 * Smaže ručně zapsaný příjem. Jen ty z Podnikání — příjmy zakázek a faktur
 * se tady smazat nedají. Příjem, který si mezitím převzala faktura
 * („Je tohle ta platba?"), taky ne: smazal by se jí doklad o zaplacení.
 */
export async function deleteBusinessIncome(id: string): Promise<BusinessIncomeResult> {
  await requireAuth()
  if (!UUID.test(id)) return { ok: false, error: 'Příjem nenalezen.' }
  try {
    const [rows] = await adminDb.batch([
      {
        text: `
          DELETE FROM finance_transactions t
          WHERE t.id = $1
            AND t.user_id IS NULL
            AND t.type = 'income'
            AND t.category IN ('${EXTRA_DEPOSIT_CATEGORY}', '${ONE_OFF_INCOME_CATEGORY}')
            AND t.source_invoice_id IS NULL
            AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.finance_transaction_id = t.id)
          RETURNING t.id::text AS id, t.source_project_id::text AS project_id
        `,
        params: [id],
      },
    ])
    const row = rows[0] as { id: string; project_id: string | null } | undefined
    if (!row) return { ok: false, error: 'Tenhle příjem už patří k faktuře. Odeberte ho u faktury.' }
    revalidateMoney(row.project_id)
    return { ok: true, id: row.id }
  } catch (err) {
    console.error('[Podnikání] Příjem se nesmazal', err)
    return { ok: false, error: 'Příjem se nepodařilo smazat. Zkuste to prosím znovu.' }
  }
}
