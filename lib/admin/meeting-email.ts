/**
 * E-mail klientovi se schůzkou (R-112): termín, odkaz na Google Meet,
 * ukázka webu a web VIZEONu. Čistá funkce — stejný text ukáže náhled
 * v okně „Domluvit schůzku" i odeslaný e-mail.
 *
 * Úvodní text píše (nebo upravuje) Kryštof; všechno ostatní doplní kód, ať
 * odkaz na schůzku nikdy nechybí a nedá se splést. Všechno, co jde do HTML,
 * se escapuje; odkazy jen https.
 */

export const VIZEON_WEB = 'https://vizeon.cz'
export const SIGNATURE = ['Kryštof Sobotka', 'VIZEON', 'krystof@vizeon.cz']

const PRAGUE = 'Europe/Prague'

// E-mailové klienty CSS proměnné neumí — barvy a písmo jsou hodnoty tokenů Dílků
// zapsané stejně jako v `lib/ws/email/layout.ts` (výjimka z „barvy natvrdo" jen pro e-maily).
const C = { ink: '#0c1a36', quiet: '#4a5878', line: '#dce7f7', navy700: '#23478b', surface: '#ffffff' } as const
const SANS = "'Instrument Sans', -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif"

/** „čtvrtek 20. listopadu v 15:00" */
export function meetingWhen(startsAt: string): string {
  const at = new Date(startsAt)
  const day = new Intl.DateTimeFormat('cs-CZ', { timeZone: PRAGUE, weekday: 'long', day: 'numeric', month: 'long' }).format(at)
  const time = new Intl.DateTimeFormat('cs-CZ', { timeZone: PRAGUE, hour: 'numeric', minute: '2-digit' }).format(at)
  return `${day} v ${time}`
}

export function defaultSubject(startsAt: string): string {
  return `Naše schůzka ${meetingWhen(startsAt)}`
}

export function defaultIntro(hasDemo: boolean): string {
  return [
    'Dobrý den,',
    '',
    hasDemo
      ? 'děkuji za domluvu. Posílám odkaz na naši schůzku a ještě jednou ukázku webu, kterou jsme pro vás připravili.'
      : 'děkuji za domluvu. Posílám odkaz na naši schůzku.',
    '',
    'Těším se na vás.',
  ].join('\n')
}

export type MeetingEmailInput = {
  intro: string
  startsAt: string
  minutes: number
  meetUrl: string
  demoUrl: string | null
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function safeHttps(url: string | null): string | null {
  if (!url) return null
  try {
    return new URL(url).protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

export function renderMeetingEmail(input: MeetingEmailInput): { text: string; html: string } {
  const when = `${meetingWhen(input.startsAt)} (${input.minutes} minut)`
  const meet = safeHttps(input.meetUrl)
  if (!meet) throw new Error('Odkaz na schůzku musí začínat https://.')
  const demo = safeHttps(input.demoUrl)
  const intro = input.intro.trim()

  const text = [
    intro,
    '',
    `Kdy: ${when}`,
    `Připojit se: ${meet}`,
    'Stačí kliknout na odkaz ve správný čas.',
    ...(demo ? ['', `Ukázka vašeho webu: ${demo}`] : []),
    `Náš web: ${VIZEON_WEB}`,
    '',
    ...SIGNATURE,
  ].join('\n')

  const p = (s: string) => `<p style="margin:0 0 14px">${s}</p>`
  const introHtml = intro
    .split(/\n{2,}/)
    .map((block) => p(escapeHtml(block).replace(/\n/g, '<br>')))
    .join('')
  const link = (href: string, label: string) =>
    `<a href="${escapeHtml(href)}" style="color:${C.navy700}">${escapeHtml(label)}</a>`

  const html = `<!doctype html><html lang="cs"><body style="margin:0;padding:24px;background:${C.surface};font-family:${SANS};font-size:15px;line-height:1.55;color:${C.ink}">
<div style="max-width:560px">
${introHtml}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px 0;border:1px solid ${C.line};border-radius:10px;width:100%">
<tr><td style="padding:16px 18px">
<p style="margin:0 0 6px;font-size:13px;color:${C.quiet}">Kdy</p>
<p style="margin:0 0 14px;font-weight:bold">${escapeHtml(when)}</p>
<a href="${escapeHtml(meet)}" style="display:inline-block;background:${C.navy700};color:${C.surface};text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:999px">Připojit se ke schůzce</a>
<p style="margin:12px 0 0;font-size:13px;color:${C.quiet}">Stačí kliknout ve správný čas. Odkaz: ${link(meet, meet)}</p>
</td></tr></table>
${demo ? p(`Ukázka vašeho webu: ${link(demo, demo)}`) : ''}
${p(`Náš web: ${link(VIZEON_WEB, 'vizeon.cz')}`)}
<p style="margin:18px 0 0">${SIGNATURE.map(escapeHtml).join('<br>')}</p>
</div></body></html>`

  return { text, html }
}
