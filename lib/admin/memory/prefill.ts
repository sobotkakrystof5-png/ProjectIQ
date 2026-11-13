import 'server-only'
import { batchTolerant, q } from '@/lib/admin/db'
import { factLines, loadFacts } from './facts'
import type { ProjectPrefill } from './types'

/**
 * Předvyplnění nové zakázky u známého klienta (AD15).
 *
 * Jméno, e-mail a telefon se berou z karty kontaktu (to je dnešní pravda
 * o člověku), zbytek z historie jeho zakázek. Cena je **poslední cena**, ne
 * průměr: u řemeslné práce je poslední cena bližší pravdě než průměr přes
 * roky, a přepsat ji je jedno kliknutí.
 */
export async function loadProjectPrefill(contactId: string): Promise<ProjectPrefill | null> {
  const facts = await loadFacts(contactId)
  if (facts.scope !== 'contact') return null

  const [rows] = await batchTolerant([
    q`SELECT display_name, email, phone FROM contacts WHERE id = ${contactId} LIMIT 1`,
  ])
  const contact = rows?.[0] as { display_name?: string; email?: string | null; phone?: string | null } | undefined
  if (!contact?.display_name && facts.client === null) return null

  return {
    contactId,
    clientName: contact?.display_name ?? facts.client?.name ?? '',
    clientEmail: contact?.email ?? facts.client?.email ?? '',
    clientPhone: contact?.phone ?? facts.client?.phone ?? '',
    serviceType: facts.lastServiceType ?? '',
    price: facts.lastPrice === null ? '' : String(Math.round(facts.lastPrice)),
    lines: factLines(facts),
  }
}
