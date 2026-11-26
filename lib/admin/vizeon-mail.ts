import 'server-only'
import { ADMIN_MAIL_TAG } from '@/lib/admin/email-delivery'

/**
 * Odesílání e-mailů klientům VIZEONu z krystof@vizeon.cz přes Resend (R-112).
 *
 * Vlastní klíč `VIZEON_RESEND_API_KEY` — doména vizeon.cz je ověřená v účtu
 * Resendu, ze kterého posílá i Growth OS; klíč ZakazIQ (`RESEND_API_KEY`,
 * doména zakaziq.cz) se schválně nepoužívá, ať e-mail nikdy neodejde z jiné
 * adresy, než Kryštof čeká. Odpovědi jdou na krystof@vizeon.cz.
 *
 * Od 2026-11-17 přes tuhle funkci jde i všechna pošta z `lib/email.ts`
 * (R-116); Gmail SMTP tam zůstal jen jako záloha bez klíče.
 */

const RESEND_URL = 'https://api.resend.com/emails'
export const DEFAULT_FROM = 'Kryštof Sobotka | VIZEON <krystof@vizeon.cz>'
export const DEFAULT_REPLY_TO = 'krystof@vizeon.cz'

export function vizeonMailConfigured(): boolean {
  return Boolean(process.env.VIZEON_RESEND_API_KEY)
}

export type VizeonMail = {
  to: string
  subject: string
  text: string
  html: string
  /** Stejný klíč = Resend e-mail podruhé neodešle (24 h). */
  idempotencyKey?: string
  /** Výchozí je krystof@vizeon.cz; jiná adresa musí být taky na vizeon.cz. */
  from?: string
  attachments?: { filename: string; content: Buffer; contentType?: string }[]
}

export type SendResult = { ok: true; id: string | null } | { ok: false; error: string }

export async function sendVizeonMail(mail: VizeonMail, fetchImpl: typeof fetch = fetch): Promise<SendResult> {
  const key = process.env.VIZEON_RESEND_API_KEY
  if (!key) return { ok: false, error: 'Chybí VIZEON_RESEND_API_KEY.' }
  // Konce řádků v předmětu nebo adrese by šly zneužít k vložení hlaviček.
  if (/[\r\n]/.test(mail.subject) || /[\r\n,;<>]/.test(mail.to)) {
    return { ok: false, error: 'Neplatný předmět nebo adresa.' }
  }
  try {
    const res = await fetchImpl(RESEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        ...(mail.idempotencyKey ? { 'Idempotency-Key': mail.idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from: mail.from || process.env.VIZEON_EMAIL_FROM || DEFAULT_FROM,
        to: [mail.to],
        reply_to: DEFAULT_REPLY_TO,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        // Podle štítku pozná webhook Resendu naše e-maily od Growth OS (R-146).
        tags: [ADMIN_MAIL_TAG],
        ...(mail.attachments?.length
          ? {
              attachments: mail.attachments.map(a => ({
                filename: a.filename,
                content: a.content.toString('base64'),
                ...(a.contentType ? { content_type: a.contentType } : {}),
              })),
            }
          : {}),
      }),
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    })
    const json = (await res.json().catch(() => null)) as { id?: string; message?: string } | null
    if (!res.ok) return { ok: false, error: `Resend ${res.status}: ${json?.message ?? 'bez odpovědi'}`.slice(0, 300) }
    return { ok: true, id: json?.id ?? null }
  } catch (err) {
    return { ok: false, error: `Resend: ${(err as Error).message}`.slice(0, 300) }
  }
}
