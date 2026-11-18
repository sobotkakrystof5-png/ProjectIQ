/**
 * E-mail s pozvánkou do klientského prostoru (KP11, R-121). Čistá funkce bez
 * databáze, ať jde text otestovat bez sítě.
 *
 * Odchází z krystof@vizeon.cz přes Resend (`lib/admin/vizeon-mail.ts`) jako
 * osobní e-mail od Kryštofa. Heslo v něm nikdy není: klient si ho nastaví sám
 * po kliknutí na odkaz (D-K12).
 *
 * Slibuje jen to, co prostor dnes opravdu umí (postup, co se dělo, požadavky
 * textem i hlasem, zprávy). Faktury, etapy a chat přidají KP12–KP15 a teprve
 * potom smí přibýt i sem.
 */

import { SIGNATURE } from '@/lib/admin/meeting-email'

// E-mailové klienty CSS proměnné neumí — hodnoty tokenů Dílků zapsané napřímo
// (výjimka z „barvy natvrdo" jen pro e-maily, stejně jako `survey-email.ts`).
const C = {
  ink: '#0c1a36',
  quiet: '#4a5878',
  line: '#dce7f7',
  navy700: '#23478b',
  surface: '#ffffff',
} as const
const SANS = "'Instrument Sans', -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif"

export type PortalInviteEmailInput =
  | {
      /** Nový člověk v prostoru: odkaz s kódem pozvánky. */
      kind: 'invite'
      projectTitle: string
      url: string
      expiresAt: Date
    }
  | {
      /** Klient už v prostoru je, přibyla mu další zakázka. */
      kind: 'new_project'
      projectTitle: string
      url: string
    }

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function pragueDate(d: Date): string {
  return new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'Europe/Prague' })
    .format(d)
    .replace(/\s/g, ' ')
}

export function renderPortalInviteEmail(input: PortalInviteEmailInput): { subject: string; text: string; html: string } {
  const url = new URL(input.url)
  if (url.protocol !== 'https:' && url.hostname !== 'localhost') {
    throw new Error('Odkaz do klientského prostoru musí začínat https://.')
  }
  const title = input.projectTitle.trim().slice(0, 200)

  const subject = input.kind === 'invite' ? 'Pozvánka do vašeho klientského prostoru' : 'Nová zakázka ve vašem prostoru'
  const button = input.kind === 'invite' ? 'Nastavit heslo a vstoupit' : 'Otevřít zakázku'
  const intro =
    input.kind === 'invite'
      ? [
          'Dobrý den,',
          `připravil jsem vám prostor, kde uvidíte, jak postupuje zakázka „${title}“. Najdete tam, co je hotové a co se právě dělá, a můžete mi tam kdykoli napsat nebo nadiktovat připomínky.`,
        ]
      : [
          'Dobrý den,',
          `do vašeho klientského prostoru jsem přidal zakázku „${title}“. Přihlaste se stejným e-mailem a heslem jako dosud.`,
        ]
  const outro =
    input.kind === 'invite'
      ? [
          `Heslo si nastavíte sami a nikdo jiný ho nezná. Odkaz platí do ${pragueDate(input.expiresAt)} a funguje jen pro tuhle e-mailovou adresu, takže ho prosím nikomu nepřeposílejte.`,
        ]
      : []

  const text = [
    ...intro.flatMap((line) => [line, '']),
    `${button}: ${input.url}`,
    '',
    ...outro.flatMap((line) => [line, '']),
    ...SIGNATURE,
  ].join('\n')

  const p = (s: string, quiet = false) =>
    `<p style="margin:0 0 14px${quiet ? `;color:${C.quiet}` : ''}">${s}</p>`

  const html = `<!doctype html><html lang="cs"><body style="margin:0;padding:24px;background:${C.surface};font-family:${SANS};font-size:15px;line-height:1.55;color:${C.ink}">
<div style="max-width:560px">
${intro.map((line) => p(escapeHtml(line))).join('')}
<p style="margin:22px 0"><a href="${escapeHtml(input.url)}" style="display:inline-block;padding:13px 24px;border-radius:999px;background:${C.navy700};color:#ffffff;font-weight:bold;text-decoration:none;font-family:${SANS}">${escapeHtml(button)}</a></p>
${outro.map((line) => p(escapeHtml(line), true)).join('')}
<p style="margin:18px 0 0;padding-top:14px;border-top:1px solid ${C.line}">${SIGNATURE.map(escapeHtml).join('<br>')}</p>
</div></body></html>`

  return { subject, text, html }
}
