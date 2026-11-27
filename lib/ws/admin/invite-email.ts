/**
 * E-mail s pozvánkou do ZakazIQ Workspace (S17, R-154). Čistá funkce bez
 * databáze, ať jde text otestovat bez sítě.
 *
 * Odchází od Kryštofa z krystof@vizeon.cz (`lib/admin/vizeon-mail.ts`) stejně
 * jako pozvánka do klientského prostoru — nabídku Workspace dává osobně (R-134).
 * Heslo v něm není: klient si přístup nastaví sám po kliknutí na odkaz.
 */

import { SIGNATURE } from '@/lib/admin/meeting-email'
import { escapeHtml } from '@/lib/security/html'

// E-mailové klienty CSS proměnné neumí — hodnoty tokenů Dílků zapsané napřímo
// (výjimka z „barvy natvrdo" jen pro e-maily, stejně jako `lib/portal/invite-email.ts`).
const C = {
  ink: '#0c1a36',
  quiet: '#4a5878',
  line: '#dce7f7',
  navy700: '#23478b',
  surface: '#ffffff',
} as const
const SANS = "'Instrument Sans', -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif"

export type WsInviteEmailInput = { businessName: string; url: string; expiresAt: Date }

function pragueDate(d: Date): string {
  return new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'Europe/Prague' })
    .format(d)
    .replace(/\s/g, ' ')
}

export function renderWsInviteEmail(input: WsInviteEmailInput): { subject: string; text: string; html: string } {
  const url = new URL(input.url)
  if (url.protocol !== 'https:' && url.hostname !== 'localhost') {
    throw new Error('Odkaz na pozvánku musí začínat https://.')
  }
  const name = input.businessName.trim().slice(0, 120)

  const subject = 'Vaše ZakazIQ je připravené'
  const button = 'Nastavit přístup'
  const intro = [
    'Dobrý den,',
    `připravil jsem vám ZakazIQ pro ${name}. Najdete v něm poptávky z webu, kalendář, zákazníky a faktury na jednom místě.`,
    'Stačí kliknout na tlačítko a nastavit si přístup. Pokud už máte přístup do klientského prostoru, přihlaste se stejným e-mailem a pozvánku jen přijměte.',
  ]
  const outro = [
    `Odkaz platí do ${pragueDate(input.expiresAt)} a funguje jen pro tuhle e-mailovou adresu, takže ho prosím nikomu nepřeposílejte.`,
  ]

  const text = [...intro.flatMap((l) => [l, '']), `${button}: ${input.url}`, '', ...outro.flatMap((l) => [l, '']), ...SIGNATURE].join('\n')

  const p = (s: string, quiet = false) => `<p style="margin:0 0 14px${quiet ? `;color:${C.quiet}` : ''}">${s}</p>`

  const html = `<!doctype html><html lang="cs"><body style="margin:0;padding:24px;background:${C.surface};font-family:${SANS};font-size:15px;line-height:1.55;color:${C.ink}">
<div style="max-width:560px">
${intro.map((l) => p(escapeHtml(l))).join('')}
<p style="margin:22px 0"><a href="${escapeHtml(input.url)}" style="display:inline-block;padding:13px 24px;border-radius:999px;background:${C.navy700};color:#ffffff;font-weight:bold;text-decoration:none;font-family:${SANS}">${escapeHtml(button)}</a></p>
${outro.map((l) => p(escapeHtml(l), true)).join('')}
<p style="margin:18px 0 0;padding-top:14px;border-top:1px solid ${C.line}">${SIGNATURE.map(escapeHtml).join('<br>')}</p>
</div></body></html>`

  return { subject, text, html }
}
