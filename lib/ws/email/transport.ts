import 'server-only'
import { Resend } from 'resend'

// Odeslání jednoho e-mailu (S15). Resend za rozhraním EmailTransport — testy
// si podstrčí vlastní a nic neodchází ven.
//
// Odesílá se jen s WS_EMAIL_FROM (adresa na ověřené doméně, např.
// rezervace@zakaziq.cz) a RESEND_API_KEY. Bez nich fronta nic nebere a zprávy
// počkají — dokud doména v Resendu není ověřená, nic neodejde do spamu ani
// se zbytečně neoznačí jako neúspěšné.

export type OutgoingEmail = {
  /** ID zprávy ve frontě = klíč idempotence u Resendu (opakování nezdvojí e-mail). */
  id: string
  fromName: string
  to: string
  replyTo: string | null
  subject: string
  html: string
  text: string
  attachments: { filename: string; content: Buffer }[]
  headers: Record<string, string>
  tags: { name: string; value: string }[]
}

export type SendResult = { ok: true; providerId: string } | { ok: false; error: string; permanent: boolean }

export type EmailTransport = { send(email: OutgoingEmail): Promise<SendResult> }

/** Jméno odesílatele bez znaků, které by rozbily hlavičku From. */
export function senderName(name: string): string {
  const clean = name.replace(/["<>\r\n,;\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 70)
  return clean || 'ZakazIQ'
}

export function emailFromAddress(): string | null {
  const from = process.env.WS_EMAIL_FROM?.trim()
  return from && /^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/i.test(from) ? from : null
}

function resendTransport(): EmailTransport | null {
  const key = process.env.RESEND_API_KEY
  const from = emailFromAddress()
  if (!key || !from) return null
  const resend = new Resend(key)
  return {
    async send(m) {
      try {
        const { data, error } = await resend.emails.send(
          {
            from: `"${senderName(m.fromName)}" <${from}>`,
            to: [m.to],
            replyTo: m.replyTo ?? undefined,
            subject: m.subject,
            html: m.html,
            text: m.text,
            attachments: m.attachments.length ? m.attachments.map((a) => ({ filename: a.filename, content: a.content })) : undefined,
            headers: Object.keys(m.headers).length ? m.headers : undefined,
            tags: m.tags,
          },
          { idempotencyKey: `ws-${m.id}` },
        )
        if (data?.id) return { ok: true, providerId: data.id }
        const status = (error as { statusCode?: number | null } | null)?.statusCode ?? 0
        const name = error?.name ?? 'unknown'
        // 4xx kromě 429 (limit) se opakováním nespraví (špatná adresa, nepovolený odesílatel).
        return { ok: false, error: `resend:${name}`.slice(0, 100), permanent: status >= 400 && status < 500 && status !== 429 }
      } catch (e) {
        return { ok: false, error: e instanceof Error ? `network:${e.name}`.slice(0, 100) : 'network', permanent: false }
      }
    },
  }
}

let override: EmailTransport | null | undefined

/** Jen pro testy: vlastní transport. `undefined` vrátí Resend. */
export function setEmailTransportForTests(t: EmailTransport | null | undefined): void {
  override = t
}

export function getEmailTransport(): EmailTransport | null {
  return override !== undefined ? override : resendTransport()
}
