import { meetingWhen, SIGNATURE } from '@/lib/admin/meeting-email'

/**
 * Potvrzení konzultace klientovi (KP14, R-126) — po rezervaci i po přesunu.
 * Odchází z krystof@vizeon.cz přes Resend (R-114, R-116).
 *
 * Čistá funkce. Text tématu napsal klient, takže se v HTML escapuje; odkazy
 * jen `https:` nebo `tel:` (WhatsApp, Teams a telefon z odkazu `/p`).
 */

const C = { ink: '#0c1a36', quiet: '#4a5878', line: '#dce7f7', navy700: '#23478b', surface: '#ffffff' } as const
const SANS = "'Instrument Sans', -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif"

export type ConsultationEmailInput = {
  kind: 'booked' | 'moved'
  startsAt: string
  minutes: number
  topic: string
  /** Odkaz na připojení: Google Meet, WhatsApp, Teams nebo `tel:`. */
  joinUrl: string | null
  /** Jak se spojíme, když odkaz není („Google Meet", „Klasický hovor"…). */
  channelLabel: string
  /** Kde jde konzultaci přesunout nebo zrušit (klientský prostor). */
  manageUrl: string | null
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function safeJoinUrl(url: string | null): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'tel:' ? url : null
  } catch {
    return null
  }
}

export function consultationSubject(kind: 'booked' | 'moved', startsAt: string): string {
  return kind === 'moved'
    ? `Konzultace je přesunutá na ${meetingWhen(startsAt)}`
    : `Konzultace ${meetingWhen(startsAt)}`
}

export function renderConsultationEmail(input: ConsultationEmailInput): { subject: string; text: string; html: string } {
  const when = `${meetingWhen(input.startsAt)} (${input.minutes} minut)`
  const join = safeJoinUrl(input.joinUrl)
  const manage = safeJoinUrl(input.manageUrl)?.startsWith('https:') ? input.manageUrl : null
  const topic = input.topic.trim()
  const opening =
    input.kind === 'moved'
      ? 'konzultace je přesunutá na nový čas. Tady je všechno pohromadě.'
      : 'děkuji za rezervaci konzultace. Tady je všechno pohromadě.'
  const joinLine = join
    ? `Připojit se: ${join}`
    : input.channelLabel === 'Google Meet'
      ? 'Odkaz na Google Meet vám pošlu ještě před začátkem.'
      : `Spojíme se přes: ${input.channelLabel}`
  const manageLine = manage
    ? `Přesunout nebo zrušit ji můžete nejpozději 24 hodin předem tady: ${manage}`
    : 'Kdybyste potřebovali termín změnit, odpovězte prosím na tenhle e-mail.'

  const text = [
    'Dobrý den,',
    '',
    opening,
    '',
    `Kdy: ${when}`,
    joinLine,
    ...(topic ? [`O čem: ${topic}`] : []),
    '',
    manageLine,
    '',
    ...SIGNATURE,
  ].join('\n')

  const p = (s: string) => `<p style="margin:0 0 14px">${s}</p>`
  const link = (href: string, label: string) =>
    `<a href="${escapeHtml(href)}" style="color:${C.navy700}">${escapeHtml(label)}</a>`
  const button = join
    ? `<a href="${escapeHtml(join)}" style="display:inline-block;background:${C.navy700};color:${C.surface};text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:999px">Připojit se ke konzultaci</a>`
    : `<p style="margin:0">${escapeHtml(joinLine)}</p>`

  const html = `<!doctype html><html lang="cs"><body style="margin:0;padding:24px;background:${C.surface};font-family:${SANS};font-size:15px;line-height:1.55;color:${C.ink}">
<div style="max-width:560px">
${p('Dobrý den,')}
${p(escapeHtml(opening))}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px 0;border:1px solid ${C.line};border-radius:10px;width:100%">
<tr><td style="padding:16px 18px">
<p style="margin:0 0 6px;font-size:13px;color:${C.quiet}">Kdy</p>
<p style="margin:0 0 14px;font-weight:bold">${escapeHtml(when)}</p>
${button}
${topic ? `<p style="margin:14px 0 0;font-size:13px;color:${C.quiet}">O čem</p><p style="margin:4px 0 0;white-space:pre-wrap">${escapeHtml(topic)}</p>` : ''}
</td></tr></table>
${manage ? p(`Přesunout nebo zrušit ji můžete nejpozději 24 hodin předem ${link(manage, 've vašem prostoru')}.`) : p(escapeHtml(manageLine))}
<p style="margin:18px 0 0">${SIGNATURE.map(escapeHtml).join('<br>')}</p>
</div></body></html>`

  return { subject: consultationSubject(input.kind, input.startsAt), text, html }
}
