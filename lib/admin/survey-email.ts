/**
 * E-mail s dotazníkem spokojenosti (R-119). Čistá funkce bez databáze.
 *
 * První otázka je přímo v e-mailu: řada čísel 0–10, každé je odkaz
 * `/h/<token>?znamka=N`. Kliknutí otevře formulář s už vybranou známkou.
 * Samotné otevření odkazu **nic neukládá** (GET nezapisuje): ukládá až
 * formulář v prohlížeči, takže robot, který odkazy v e-mailech projíždí,
 * známku nevyrobí.
 *
 * Odchází z krystof@vizeon.cz přes Resend (`lib/admin/vizeon-mail.ts`) jako
 * osobní e-mail od Kryštofa, ne jako upozornění systému.
 */

import { SIGNATURE } from '@/lib/admin/meeting-email'
import { escapeHtml } from '@/lib/security/html'

// E-mailové klienty CSS proměnné neumí — hodnoty tokenů Dílků zapsané napřímo
// (výjimka z „barvy natvrdo" jen pro e-maily, stejně jako `meeting-email.ts`).
const C = {
  ink: '#0c1a36',
  quiet: '#4a5878',
  line: '#dce7f7',
  navy50: '#eef2fb',
  navy700: '#23478b',
  surface: '#ffffff',
} as const
const SANS = "'Instrument Sans', -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif"

export const SURVEY_QUESTION = 'Doporučili byste mě známému, který potřebuje něco podobného?'

export type SurveyEmailInput = {
  /** Název zakázky (popis, nebo jméno klienta). */
  title: string
  /** Adresa dotazníku `https://…/h/<token>`. */
  surveyUrl: string
  reminder: boolean
}

/** Odkaz s předvybranou známkou. */
export function scoreUrl(surveyUrl: string, score: number): string {
  const url = new URL(surveyUrl)
  url.searchParams.set('znamka', String(score))
  return url.toString()
}

export function surveySubject(reminder: boolean): string {
  return reminder ? 'Ještě ta jedna otázka k zakázce' : 'Jak se vám se mnou pracovalo?'
}

function introLines(input: SurveyEmailInput): string[] {
  const title = input.title.trim()
  return input.reminder
    ? [
        'Dobrý den,',
        `před týdnem jsem vám poslal jednu otázku k zakázce „${title}“. Kdybyste měli chvilku, stačí kliknout na číslo níž. Pokud odpovídat nechcete, nic se neděje a víc už vám s tím psát nebudu.`,
      ]
    : [
        'Dobrý den,',
        `zakázka „${title}“ je hotová a moc vám děkuji za spolupráci. Mám jednu otázku a odpověď zabere jedno kliknutí.`,
      ]
}

export function renderSurveyEmail(input: SurveyEmailInput): { subject: string; text: string; html: string } {
  const url = new URL(input.surveyUrl)
  if (url.protocol !== 'https:' && url.hostname !== 'localhost') {
    throw new Error('Odkaz na dotazník musí začínat https://.')
  }
  const intro = introLines(input)
  const scores = Array.from({ length: 11 }, (_, n) => n)

  const text = [
    ...intro.flatMap((line) => [line, '']),
    SURVEY_QUESTION,
    '0 znamená určitě ne, 10 určitě ano.',
    '',
    ...scores.map((n) => `${n}: ${scoreUrl(input.surveyUrl, n)}`),
    '',
    'Po kliknutí se otevře krátký formulář. Napsat můžete víc, ale nemusíte.',
    '',
    ...SIGNATURE,
  ].join('\n')

  const cell = (n: number) =>
    `<td align="center" style="padding:0 2px"><a href="${escapeHtml(scoreUrl(input.surveyUrl, n))}" ` +
    `style="display:block;min-width:24px;padding:11px 0;border:1px solid ${C.line};border-radius:8px;` +
    `background:${C.navy50};color:${C.navy700};font-weight:bold;font-size:15px;text-decoration:none;` +
    `font-family:${SANS}">${n}</a></td>`

  const p = (s: string) => `<p style="margin:0 0 14px">${s}</p>`

  const html = `<!doctype html><html lang="cs"><body style="margin:0;padding:24px;background:${C.surface};font-family:${SANS};font-size:15px;line-height:1.55;color:${C.ink}">
<div style="max-width:560px">
${intro.map((line) => p(escapeHtml(line))).join('')}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px 0;border:1px solid ${C.line};border-radius:12px;width:100%">
<tr><td style="padding:18px 14px">
<p style="margin:0 0 14px;font-weight:bold;font-size:16px">${escapeHtml(SURVEY_QUESTION)}</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;table-layout:fixed"><tr>${scores.map(cell).join('')}</tr></table>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin-top:6px"><tr>
<td style="font-size:12px;color:${C.quiet}">Určitě ne</td>
<td align="right" style="font-size:12px;color:${C.quiet}">Určitě ano</td>
</tr></table>
</td></tr></table>
${p(`<span style="color:${C.quiet}">Po kliknutí se otevře krátký formulář. Napsat můžete víc, ale nemusíte.</span>`)}
<p style="margin:18px 0 0">${SIGNATURE.map(escapeHtml).join('<br>')}</p>
</div></body></html>`

  return { subject: surveySubject(input.reminder), text, html }
}
