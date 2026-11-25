import { escapeHtml } from '@/lib/security/html'
import { SIGNATURE } from '@/lib/admin/meeting-email'
import type { MeetingAi } from '@/types/meeting-notes'

/**
 * E-mail klientovi po schůzce (R-144): co jsme si řekli, na čem jsme se
 * domluvili a kdo co udělá. Přepis do e-mailu nejde — ten zůstává v ZakazIQ
 * (rozhodl Kryštof 2026-11-24).
 *
 * Text skládá kód ze struktury od AI, ne model sám: oslovení, body a kroky
 * jsou vždy na stejném místě a nic navíc se do e-mailu nedostane. Odchází jako
 * koncept do Gmailu, Kryštof ho tam přečte a odešle sám.
 */

const PRAGUE = 'Europe/Prague'
const C = { ink: '#0c1a36' } as const
const SANS = "'Instrument Sans', -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif"

export function meetingDay(startedAt: string | null): string | null {
  if (!startedAt) return null
  const d = new Date(startedAt)
  if (Number.isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat('cs-CZ', { timeZone: PRAGUE, day: 'numeric', month: 'numeric', year: 'numeric' }).format(d)
}

/** Je co poslat? Bez dohod a kroků by e-mail byl jen „děkuji za schůzku". */
export function hasEmailContent(ai: MeetingAi): boolean {
  return ai.agreements.length + ai.mySteps.length + ai.clientSteps.length > 0
}

export type MeetingEmail = { subject: string; text: string; html: string }

function oneLine(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim()
}

export function composeMeetingEmail(ai: MeetingAi, startedAt: string | null): MeetingEmail {
  const day = meetingDay(startedAt)
  const subject = day ? `Shrnutí naší schůzky z ${day}` : 'Shrnutí naší schůzky'
  const salutation = oneLine(ai.salutation ?? '') || 'Dobrý den,'
  const intro =
    ai.agreements.length > 0
      ? 'děkuji za schůzku. Posílám shrnutí, na čem jsme se domluvili, ať to máme oba na jednom místě.'
      : 'děkuji za schůzku. Posílám shrnutí a další kroky, ať to máme oba na jednom místě.'

  const sections: { title: string; items: string[] }[] = [
    { title: 'Na čem jsme se domluvili', items: ai.agreements },
    { title: 'Co udělám já', items: ai.mySteps },
    { title: 'Co prosím připravíte vy', items: ai.clientSteps },
    { title: 'Co ještě upřesníme', items: ai.openQuestions },
  ].filter((s) => s.items.length > 0)

  const closing = 'Kdyby něco ve shrnutí nesedělo, napište mi prosím.'

  const text = [
    salutation,
    '',
    intro,
    ...sections.flatMap((s) => ['', `${s.title}:`, ...s.items.map((i) => `- ${oneLine(i)}`)]),
    '',
    closing,
    '',
    'S pozdravem',
    ...SIGNATURE,
  ].join('\n')

  const p = (s: string, style = 'margin:0 0 14px') => `<p style="${style}">${s}</p>`
  const sectionsHtml = sections
    .map(
      (s) =>
        `<p style="margin:18px 0 6px;font-weight:bold">${escapeHtml(s.title)}</p>` +
        `<ul style="margin:0 0 6px;padding-left:20px">${s.items.map((i) => `<li style="margin:0 0 6px">${escapeHtml(oneLine(i))}</li>`).join('')}</ul>`,
    )
    .join('')

  const html = `<!doctype html><html lang="cs"><body style="margin:0;padding:24px;font-family:${SANS};font-size:15px;line-height:1.55;color:${C.ink}">
<div style="max-width:560px">
${p(escapeHtml(salutation))}
${p(escapeHtml(intro))}
${sectionsHtml}
${p(escapeHtml(closing), 'margin:18px 0 14px')}
<p style="margin:18px 0 0">S pozdravem<br>${SIGNATURE.map(escapeHtml).join('<br>')}</p>
</div></body></html>`

  return { subject, text, html }
}
