'use server'

import { revalidatePath } from 'next/cache'
import { requireAuth } from '@/lib/auth'
import { adminDb } from '@/lib/admin/db'
import { ensureContact } from '@/lib/admin/contacts'
import { convertLeadToProject } from '@/app/calls-actions'

/**
 * Co se dá udělat s AI leadem (AD16).
 *
 * Záměrně se tu **nepíše druhá cesta k zakázce**: lead se přepíše do Hovorů
 * jako každý jiný kontakt a dál ho vede stávající `convertLeadToProject`.
 * Jedna cesta znamená, že se zakázka vždycky zakládá stejně — s kontaktem,
 * poznámkami i uvítacím e-mailem.
 *
 * Z odhadů modelu (`summary`, `communication_strategy`) se do Hovorů
 * přepisuje jen shrnutí, a to jako **poznámka označená za odhad**. Pole
 * `client_*` jsou tvrzení člověka z formuláře a jdou do kontaktu tak, jak
 * přišla.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type AgentLeadSource = {
  client_name: string
  client_email: string
  client_phone: string | null
  client_company: string | null
  client_service: string
  client_budget: string | null
  client_message: string | null
  summary: string
  client_lead_id: string | null
}

async function loadSource(id: string): Promise<AgentLeadSource | null> {
  const rows = await adminDb<AgentLeadSource>`
    SELECT client_name, client_email, client_phone, client_company, client_service,
           client_budget, client_message, summary,
           to_jsonb(agent_leads) ->> 'client_lead_id' AS client_lead_id
    FROM agent_leads WHERE id = ${id} LIMIT 1
  `
  return rows[0] ?? null
}

/** Chybí-li sloupce z migrace 112, vyřízení se jen nezapamatuje. */
async function markHandled(id: string, leadId: string | null): Promise<void> {
  try {
    await adminDb`
      UPDATE agent_leads
      SET handled_at = now(), client_lead_id = coalesce(client_lead_id, ${leadId})
      WHERE id = ${id}
    `
  } catch (err) {
    if ((err as { code?: string })?.code !== '42703') throw err
  }
}

export type AgentLeadResult = { ok: true; leadId: string } | { ok: false; error: string }

/**
 * Přepíše AI lead do Hovorů. Vrací id nového kontaktu, ať na něj jde rovnou
 * odkázat. Opakované kliknutí nový kontakt nezaloží — vrátí ten původní.
 */
export async function convertAgentLeadToCall(id: string): Promise<AgentLeadResult> {
  await requireAuth()
  if (!UUID.test(id)) return { ok: false, error: 'Lead nenalezen.' }

  const source = await loadSource(id)
  if (!source) return { ok: false, error: 'Lead nenalezen.' }
  if (source.client_lead_id) return { ok: true, leadId: source.client_lead_id }

  const contactId = await ensureContact({
    name: source.client_name,
    company: source.client_company,
    email: source.client_email,
    phone: source.client_phone,
    source: 'lead',
  })

  const poznamka = [
    source.client_message?.trim() ? `Z formuláře: ${source.client_message.trim()}` : null,
    source.client_budget?.trim() ? `Rozpočet podle klienta: ${source.client_budget.trim()}` : null,
    source.summary.trim() ? `Shrnutí od AI (odhad, ne fakt): ${source.summary.trim()}` : null,
  ]
    .filter((line): line is string => line !== null)
    .join('\n\n')

  const rows = await adminDb<{ id: string }>`
    INSERT INTO client_leads (
      company_name, contact_name, phone, email, lead_status, next_action, notes, estimated_value, contact_id
    ) VALUES (
      ${source.client_company ?? source.client_name},
      ${source.client_name},
      ${source.client_phone},
      ${source.client_email},
      'new',
      ${`Ozvat se — poptávka: ${source.client_service}`},
      ${poznamka || null},
      NULL,
      ${contactId}
    )
    RETURNING id::text AS id
  `
  const leadId = rows[0]?.id
  if (!leadId) return { ok: false, error: 'Kontakt se nepodařilo založit.' }

  await markHandled(id, leadId)
  revalidatePath('/dashboard/calls')
  revalidatePath('/dashboard/kontakty')
  return { ok: true, leadId }
}

/**
 * Rovnou zakázka: lead se přepíše do Hovorů a pak ho převezme tatáž akce,
 * jakou se zakázka zakládá z kteréhokoli jiného kontaktu (ta na konci
 * přesměruje na novou zakázku).
 */
export async function convertAgentLeadToProject(id: string): Promise<AgentLeadResult> {
  const result = await convertAgentLeadToCall(id)
  if (!result.ok) return result
  await convertLeadToProject(result.leadId)
  return result
}

/** „Nezajímavé" — lead zmizí z pruhu, ale v databázi zůstane. */
export async function dismissAgentLead(id: string): Promise<void> {
  await requireAuth()
  if (!UUID.test(id)) throw new Error('Lead nenalezen.')
  await markHandled(id, null)
  revalidatePath('/dashboard/calls')
}

/** „Zpět" k vyřízení — lead se do pruhu vrátí. */
export async function restoreAgentLead(id: string): Promise<void> {
  await requireAuth()
  if (!UUID.test(id)) throw new Error('Lead nenalezen.')
  try {
    await adminDb`UPDATE agent_leads SET handled_at = NULL WHERE id = ${id}`
  } catch (err) {
    if ((err as { code?: string })?.code !== '42703') throw err
  }
  revalidatePath('/dashboard/calls')
}
