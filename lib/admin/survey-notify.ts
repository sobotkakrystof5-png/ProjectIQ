import 'server-only'
import { sendBrandedEmail, type EmailField } from '@/lib/email'
import { createNotification } from '@/lib/notifications'
import { adminEmail, projectPath } from '@/lib/lead-origins'
import { appBaseUrl } from '@/lib/utils'
import { answeredRatings, npsGroup, type SurveyAnswer } from '@/lib/admin/survey-model'
import type { SurveyProject } from '@/lib/admin/survey-answers'

/**
 * Co se Kryštofovi ozve, když klient odpoví na dotazník (R-119).
 *
 *  - **Nespokojený (0–6):** zvonek a e-mail „Nespokojený klient" s telefonem
 *    a e-mailem, ať se mu stihne ozvat. Odchází jednou (zámek
 *    `detractor_alerted_at`) — buď po samotné známce, když klient formulář
 *    nedokončí, nebo s odesláním formuláře, i s jeho textem.
 *  - **Odeslaný formulář:** zvonek a e-mail se vším, co klient napsal.
 *
 * Selhání e-mailu nic nezastaví: odpověď je už uložená.
 */

function who(project: SurveyProject): string {
  return project.client_name?.trim() || project.title
}

function contactFields(project: SurveyProject): EmailField[] {
  return [
    ...(project.client_phone?.trim() ? [{ label: 'Telefon', value: project.client_phone.trim() }] : []),
    ...(project.client_email?.trim() ? [{ label: 'E-mail', value: project.client_email.trim() }] : []),
  ]
}

function answerFields(answer: SurveyAnswer): EmailField[] {
  return [
    ...(answer.nps !== null ? [{ label: 'Doporučil by vás', value: `${answer.nps} / 10` }] : []),
    ...answeredRatings(answer).map((r) => ({ label: r.label, value: `${r.value} / 5` })),
    ...(answer.improve_text ? [{ label: 'Co by zlepšil', value: answer.improve_text }] : []),
    ...(answer.reference_text ? [{ label: 'Reference', value: answer.reference_text }] : []),
  ]
}

function projectLink(project: SurveyProject): string {
  return `${appBaseUrl()}${projectPath(project.id)}`
}

export async function alertDetractor(answer: SurveyAnswer, project: SurveyProject): Promise<void> {
  const name = who(project)
  await createNotification({
    type: 'survey_detractor',
    title: `Nespokojený klient — ${name}`,
    body: `Známka ${answer.nps ?? '?'} z 10 · ${project.title}`,
    link: projectPath(project.id),
  })
  const to = adminEmail()
  if (!to) return
  await sendBrandedEmail({
    to,
    subject: `Nespokojený klient: ${name} (${answer.nps ?? '?'} z 10)`,
    heading: 'Klient není spokojený',
    intro: answer.completed_at
      ? `${name} odeslal(a) dotazník k zakázce „${project.title}“. Ozvěte se, dokud se dá něco zachránit.`
      : `${name} dal(a) v dotazníku k zakázce „${project.title}“ nízkou známku a zbytek zatím nevyplnil(a). Ozvěte se, dokud se dá něco zachránit.`,
    fields: [...answerFields(answer), ...contactFields(project)],
    ctas: [{ label: 'Otevřít zakázku', href: projectLink(project) }],
  })
}

export async function notifySurveySubmitted(answer: SurveyAnswer, project: SurveyProject): Promise<void> {
  const name = who(project)
  const group = answer.nps === null ? null : npsGroup(answer.nps)
  await createNotification({
    type: 'survey_submitted',
    title: 'Vyplněný dotazník spokojenosti',
    body: answer.nps !== null ? `${name} · ${answer.nps} z 10` : name,
    link: projectPath(project.id),
  })
  const to = adminEmail()
  if (!to) return
  await sendBrandedEmail({
    to,
    subject: `Vyplněný dotazník – ${name}${answer.nps !== null ? ` (${answer.nps} z 10)` : ''}`,
    heading: group === 'promoter' ? 'Spokojený klient' : 'Vyplněný dotazník spokojenosti',
    intro:
      group === 'promoter' && answer.consent
        ? `${name} vyplnil(a) dotazník k zakázce „${project.title}“ a souhlasí se zveřejněním reference.`
        : `${name} vyplnil(a) dotazník k zakázce „${project.title}“.`,
    fields: [...answerFields(answer), ...(group === 'detractor' ? contactFields(project) : [])],
    ctas: [{ label: 'Otevřít zakázku', href: projectLink(project) }],
  })
}
