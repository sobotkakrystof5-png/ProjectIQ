import 'server-only'
import { adminDb } from '@/lib/admin/db'
import { ensureContact } from '@/lib/admin/contacts'
import { createNotification } from '@/lib/notifications'
import { safeHttpUrl } from '@/lib/security/html'
import {
  intakeConfigured,
  loadBriefForContact,
  startResearch,
  webFromEmail,
  type AutoTrigger,
  type OfferBrief,
} from './research'
import { fireRoutine, type FireRoutine } from './routine'

/**
 * Rozbor firmy se spustí sám (navrhovač nabídek N4, R-158, mění D-N1):
 *
 *  - když firma od AI asistenta nově řekne ano (`autoResearchAfterConsent`,
 *    volá příjem snímků z Growth OS),
 *  - když přijde poptávka z webu vizeon.cz, alteno.cz nebo prvotka.cz
 *    (`researchAfterWebLead`, volá `lib/web-leads.ts`).
 *
 * „Když nebude možné nic najít, vykašli se na to a dej mi oznámení" (Kryštof
 * 2026-11-28): poptávka bez webu firmy a bez firemního e-mailu se nezkouší
 * a dozví se to Kryštof v upozornění o poptávce. Rozbor, který úloha vzdá
 * (`nepodarilo_se`) nebo nedoběhne, dá upozornění v `research.ts`.
 *
 * Automatika má vlastní strop (`AUTO_DAILY_LIMIT`), aby na ruční rozbory
 * zbylo místo v denním stropu (`DAILY_RUN_LIMIT` v `research.ts`). Jeden kontakt dostane
 * automatický rozbor nejvýš jednou za `AUTO_REPEAT_DAYS`.
 *
 * Nic z toho nesmí shodit příjem snímku ani poptávky: všechno běží po
 * odpovědi (`after()`) a chyby se jen logují.
 */

/** Automatických rozborů za 24 h. Zbytek denního stropu zůstává pro tlačítko. */
export const AUTO_DAILY_LIMIT = 10
/** Kontakt, u kterého rozbor už jednou byl, se znovu sám nespouští. */
export const AUTO_REPEAT_DAYS = 365

export type AutoOutcome =
  | 'started'
  | 'queued'
  | 'already'
  | 'nothing_to_search'
  | 'daily_limit'
  | 'not_connected'
  | 'not_found'

/**
 * Je podle čeho hledat? Web nebo IČO stačí vždy. Firma od asistenta má
 * skutečný název firmy z Growth OS, takže se hledá i bez webu. Poptávka
 * z webu bez webu a IČO je jen jméno člověka: to se nehledá (soukromí,
 * skill `zakaziq-rozbor-firmy`) a rozbor by nic nenašel.
 */
export function hasSomethingToSearch(brief: Pick<OfferBrief, 'web' | 'ico'>, trigger: AutoTrigger): boolean {
  if (brief.web !== null || brief.ico !== null) return true
  return trigger === 'outreach'
}

/** Doména webu jako náhradní název firmy („https://www.studny-novak.cz/" → „studny-novak.cz"). */
export function webLabel(web: string | null): string | null {
  if (!web) return null
  try {
    return new URL(web).hostname.replace(/^www\./, '') || null
  } catch {
    return null
  }
}

/** Rozbor u tohohle kontaktu (i sloučeného) za posledních `AUTO_REPEAT_DAYS` dní? */
async function alreadyResearched(contactId: string): Promise<boolean> {
  const rows = await adminDb<{ found: boolean }>`
    SELECT EXISTS (
      SELECT 1 FROM offer_research r JOIN contacts c ON c.id = r.contact_id
       WHERE coalesce(c.merged_into, c.id) = (SELECT coalesce(merged_into, id) FROM contacts WHERE id = ${contactId})
         AND r.created_at > now() - interval '1 day' * ${AUTO_REPEAT_DAYS}
    ) AS found`
  return rows[0]?.found === true
}

async function autoRunsToday(): Promise<number> {
  const rows = await adminDb<{ n: number }>`
    SELECT count(*)::int AS n FROM offer_research
     WHERE created_at > now() - interval '24 hours' AND brief ? 'trigger'`
  return rows[0]?.n ?? 0
}

async function notifySkipped(contactId: string, company: string, body: string): Promise<void> {
  await createNotification({
    type: 'offer_research_skipped',
    title: `Rozbor firmy se nespustil: ${company.slice(0, 120)}`,
    body,
    link: `/dashboard/kontakty/${contactId}`,
  })
}

const LIMIT_BODY =
  'Dnes už proběhl nejvyšší počet rozborů. Když nabídku potřebujete, spusťte rozbor na kartě kontaktu zítra, nebo ji připravte ručně.'

/**
 * Spustí rozbor u kontaktu bez kliknutí. Ticho, když rozbor u kontaktu už
 * byl nebo běží; upozornění, když není podle čeho hledat, nebo je strop.
 */
export async function autoStartResearch(
  input: { contactId: string; trigger: AutoTrigger; web?: string | null; companyHint?: string | null },
  fire: FireRoutine = fireRoutine,
): Promise<AutoOutcome> {
  if (!intakeConfigured()) return 'not_connected'
  if (await alreadyResearched(input.contactId)) return 'already'

  const brief = await loadBriefForContact(input.contactId, input.web, input.companyHint)
  if (brief === null) return 'not_found'
  if (!hasSomethingToSearch(brief, input.trigger)) {
    await notifySkipped(
      input.contactId,
      brief.company,
      'U kontaktu chybí web i IČO, takže není podle čeho hledat. Když firmu znáte, doplňte web na kartě kontaktu a spusťte rozbor.',
    )
    return 'nothing_to_search'
  }
  if ((await autoRunsToday()) >= AUTO_DAILY_LIMIT) {
    await notifySkipped(input.contactId, brief.company, LIMIT_BODY)
    return 'daily_limit'
  }

  const out = await startResearch(
    { contactId: input.contactId, web: input.web, companyHint: input.companyHint, trigger: input.trigger },
    fire,
  )
  if (out.ok) return out.fired ? 'started' : 'queued'
  if (out.error === 'daily_limit') {
    await notifySkipped(input.contactId, brief.company, LIMIT_BODY)
    return 'daily_limit'
  }
  if (out.error === 'already_running') return 'already'
  return out.error
}

/** Firmy od asistenta, které v tomhle snímku nově řekly ano (kontakty z `ingestOutreachLeads`). */
export async function autoResearchAfterConsent(contactIds: string[], fire: FireRoutine = fireRoutine): Promise<void> {
  for (const contactId of [...new Set(contactIds)].slice(0, AUTO_DAILY_LIMIT)) {
    try {
      await autoStartResearch({ contactId, trigger: 'outreach' }, fire)
    } catch (err) {
      console.error('[navrhovac] automatický rozbor po souhlasu selhal:', err instanceof Error ? err.message.slice(0, 120) : 'unknown')
    }
  }
}

export type WebLeadResearch = AutoOutcome | 'no_contact'

/**
 * Poptávka z webu: podle webu firmy (z formuláře, jinak z firemního
 * e-mailu) založí nebo najde kontakt, napojí na něj poptávku a spustí
 * rozbor. Bez webu nic nezakládá a vrátí `nothing_to_search`; upozornění
 * o poptávce to pak řekne jednou větou (bez druhého zvonku na tutéž věc).
 * Nikdy nevyhazuje.
 */
export async function researchAfterWebLead(
  lead: { projectId: string; name: string; email: string | null; phone: string | null; companyUrl?: string | null },
  fire: FireRoutine = fireRoutine,
): Promise<WebLeadResearch> {
  try {
    if (!intakeConfigured()) return 'not_connected'
    const web = webLeadSite(lead.companyUrl, lead.email)
    if (web === null) return 'nothing_to_search'

    // Údaje z formuláře nikdo neověřil: najdou nebo založí kontakt, ale existujícímu nic nedoplní.
    const contactId = await ensureContact({ name: lead.name, email: lead.email, phone: lead.phone, source: 'web', fillMissing: false })
    if (contactId === null) return 'no_contact'
    await adminDb`UPDATE projects SET contact_id = ${contactId} WHERE id = ${lead.projectId} AND contact_id IS NULL`

    return await autoStartResearch({ contactId, trigger: 'web_lead', web, companyHint: webLabel(web) }, fire)
  } catch (err) {
    console.error('[navrhovac] automatický rozbor po poptávce selhal:', err instanceof Error ? err.message.slice(0, 120) : 'unknown')
    return 'not_found'
  }
}

/** Věta do upozornění o poptávce, když se rozbor nespustil, protože není podle čeho hledat. */
export const WEB_LEAD_NOTHING_TO_SEARCH = 'Rozbor firmy se nespustil, poptávka nemá web firmy ani firemní e-mail.'

/** Web firmy z poptávky: z formuláře, jinak z e-mailu na vlastní doméně. */
export function webLeadSite(companyUrl: string | null | undefined, email: string | null): string | null {
  return safeHttpUrl(companyUrl ?? null) ?? webFromEmail(email)
}

/** Co připsat do upozornění o poptávce. Bez propojené úlohy nic (rozbor by se nespustil ani s webem). */
export function webLeadResearchNote(companyUrl: string | null | undefined, email: string | null): string | null {
  if (!intakeConfigured()) return null
  return webLeadSite(companyUrl, email) === null ? WEB_LEAD_NOTHING_TO_SEARCH : null
}
