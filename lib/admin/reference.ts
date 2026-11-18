import { ratingAverage, type SurveyAnswer } from '@/lib/admin/survey-model'
import type { ClosedProject } from '@/lib/types'

/**
 * Reference pro web z vyplněného dotazníku (AD16).
 *
 * Tři pravidla, a všechna jsou tvrdá:
 *  1. **Bez souhlasu se reference vůbec nenabídne.** Souhlas je na dotazníku
 *     (`project_surveys.consent`) a od AD16 je dobrovolný — klient smí
 *     ohodnotit spolupráci a zveřejnění odmítnout. Od R-119 má tři úrovně:
 *     „bez jména" znamená, že jméno ani firma do reference nejdou.
 *  2. **Text se nikdy nepřepisuje.** Do reference jde doslova to, co klient
 *     napsal; nic se nedoplňuje, nekrátí ani „neučesává" (B10).
 *  3. **Nic se nepublikuje samo.** Výstup je text ke zkopírování, na web ho
 *     pořád vkládá člověk.
 *
 * Čistá funkce bez databáze a bez Reactu — jde ji otestovat a volat
 * ze serveru i z prohlížeče.
 */

export type ReferenceSnippet = {
  /** Jméno klienta tak, jak je u zakázky. */
  name: string
  /** Firma, pokud ji zakázka zná. */
  company: string | null
  /** Průměr hvězdiček na jedno desetinné místo; `null`, když klient dal jen známku 0–10. */
  rating: number | null
  /** Celé hvězdičky pro web (1–5), nebo `null`. */
  stars: number | null
  /** Co klient napsal. Prázdné = reference bez textu, jen hvězdičky. */
  text: string | null
  /** Datum vyplnění ve tvaru `YYYY-MM-DD`. */
  date: string
}

/** Průměr vyplněných hvězdiček (nové oblasti, u staré odpovědi staré). */
export function surveyAverage(survey: SurveyAnswer): number | null {
  return ratingAverage(survey)
}

/** Souhlas je jediná podmínka. Bez něj se tlačítko ani neukáže. */
export function canUseAsReference(survey: Pick<SurveyAnswer, 'consent'>): boolean {
  return survey.consent === true
}

function isoDay(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10)
}

export function buildReference(
  survey: SurveyAnswer,
  project: Pick<ClosedProject, 'client_name' | 'company'>,
): ReferenceSnippet | null {
  if (!canUseAsReference(survey)) return null
  const average = surveyAverage(survey)
  const text = survey.reference_text?.trim()
  const anonymous = survey.publish_mode === 'anonymous'
  return {
    name: anonymous ? 'Klient' : project.client_name?.trim() || 'Klient',
    // Firmu nebo pozici napsal klient sám; jinak firma ze zakázky.
    company: anonymous ? null : survey.reviewer_role?.trim() || project.company?.trim() || null,
    rating: average === null ? null : Math.round(average * 10) / 10,
    stars: average === null ? null : Math.round(average),
    text: text ? text : null,
    date: isoDay(survey.created_at),
  }
}

/** Podoba ke zkopírování do textu — co se dá rovnou vložit na stránku. */
export function referenceAsText(snippet: ReferenceSnippet): string {
  const kdo = snippet.company ? `${snippet.name}, ${snippet.company}` : snippet.name
  const hvezdy =
    snippet.stars === null || snippet.rating === null
      ? null
      : `${'★'.repeat(snippet.stars)}${'☆'.repeat(5 - snippet.stars)} ${snippet.rating} / 5`
  const lines = [snippet.text ? `„${snippet.text}"` : null, `— ${kdo}`, hvezdy]
  return lines.filter((line): line is string => line !== null).join('\n')
}

/** Podoba pro web vizeon.cz — hotový objekt do pole referencí. */
export function referenceAsJson(snippet: ReferenceSnippet): string {
  return JSON.stringify(
    {
      name: snippet.name,
      company: snippet.company,
      rating: snippet.rating,
      text: snippet.text,
      date: snippet.date,
    },
    null,
    2,
  )
}
