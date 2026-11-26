import { ResearchCard } from '@/components/admin/offers/research-card'
import { listResearchForContact, loadBriefForContact, researchSetup } from '@/lib/admin/offers/research'

/**
 * Rozbor firmy na kartě kontaktu (navrhovač nabídek, N1). Načte poslední
 * rozbory, předvyplněný web firmy a jestli je propojení s Claude Code nastavené.
 *
 * Bez migrace 136/137 se karta neukáže a zbytek stránky běží dál — stejně
 * jako paměť bez 111.
 */
export async function ResearchSection({ contactId }: { contactId: string }) {
  const data = await Promise.all([listResearchForContact(contactId), loadBriefForContact(contactId)]).catch(
    (err: unknown) => {
      console.error('[navrhovac] karta rozboru se nenačetla:', err instanceof Error ? err.message.slice(0, 120) : 'unknown')
      return null
    },
  )
  if (data === null) return null
  const [rows, brief] = data
  return <ResearchCard contactId={contactId} initialWeb={brief?.web ?? null} setup={researchSetup()} rows={rows} />
}
