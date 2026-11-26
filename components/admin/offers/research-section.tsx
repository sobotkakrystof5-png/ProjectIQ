import { ResearchCard } from '@/components/admin/offers/research-card'
import { listResearchForContact, loadAgentSetup, loadBriefForContact } from '@/lib/admin/offers/research'

/**
 * Rozbor firmy na kartě kontaktu (navrhovač nabídek, N1). Načte stav agentů,
 * poslední rozbory a předvyplněný web firmy.
 *
 * Bez migrace 136 (tabulka `offer_research`, sloupec `admin_settings.offer_agents`)
 * se karta neukáže a zbytek stránky běží dál — stejně jako paměť bez 111.
 */
export async function ResearchSection({ contactId }: { contactId: string }) {
  const data = await Promise.all([loadAgentSetup(), listResearchForContact(contactId), loadBriefForContact(contactId)]).catch(
    (err: unknown) => {
      console.error('[navrhovac] karta rozboru se nenačetla:', err instanceof Error ? err.message.slice(0, 120) : 'unknown')
      return null
    },
  )
  if (data === null) return null
  const [setup, rows, brief] = data
  return <ResearchCard contactId={contactId} initialWeb={brief?.web ?? null} setup={setup.status} rows={rows} />
}
