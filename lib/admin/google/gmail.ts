import 'server-only'
import { randomUUID } from 'node:crypto'
import { googleAccessToken, googleGrantedScopes, type Fetch } from '@/lib/admin/google/oauth'

/**
 * Koncept e-mailu v Gmailu Kryštofa (R-144). Jen **koncept**: ZakazIQ ho
 * založí do Konceptů v krystof@vizeon.cz, Kryštof si ho v Gmailu přečte,
 * případně upraví a odešle sám. Odeslat odsud nejde — scope `gmail.compose`
 * by to sice dovolil, ale kód volá jen `drafts`.
 *
 * Vyžaduje znovu propojit Google v Profilu (přibylo oprávnění) a zapnuté
 * Gmail API v projektu Google Cloud `zakaziq-admin`.
 */

export const GMAIL_COMPOSE_SCOPE = 'https://www.googleapis.com/auth/gmail.compose'
const DRAFTS_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/drafts'

export type GmailDraftInput = { to: string; subject: string; text: string; html: string }
export type GmailDraft = { draftId: string; messageId: string | null }

/** Má propojení oprávnění zakládat koncepty? Bez něj se koncept nezakládá a Profil nabídne propojit znovu. */
export async function gmailDraftsAvailable(): Promise<boolean> {
  const scopes = await googleGrantedScopes()
  return scopes !== null && scopes.split(/\s+/).includes(GMAIL_COMPOSE_SCOPE)
}

function base64(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64')
}

/** Base64 po 76 znacích na řádek (RFC 2045). */
function base64Lines(value: string): string {
  return base64(value).replace(/.{1,76}/g, (line) => `${line}\r\n`)
}

/** Hlavička s diakritikou (RFC 2047). */
export function encodeHeader(value: string): string {
  return /^[\x20-\x7e]*$/.test(value) ? value : `=?UTF-8?B?${base64(value)}?=`
}

export function toBase64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Zpráva ve tvaru RFC 2822 s textovou i HTML částí. Konec řádku v adrese
 * nebo předmětu by šel zneužít k vložení hlavičky (třeba Bcc), proto se
 * takový vstup odmítne.
 */
export function buildMimeMessage(input: GmailDraftInput, boundary = `zakaziq-${randomUUID()}`): string {
  if (/[\r\n]/.test(input.subject) || /[\r\n,;<>]/.test(input.to)) {
    throw new Error('Neplatný předmět nebo adresa.')
  }
  return [
    `To: ${input.to}`,
    `Subject: ${encodeHeader(input.subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    base64Lines(input.text),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    base64Lines(input.html),
    `--${boundary}--`,
    '',
  ].join('\r\n')
}

async function call(method: 'POST' | 'DELETE', url: string, body: unknown, fetchImpl: Fetch): Promise<unknown> {
  const token = await googleAccessToken(fetchImpl)
  const res = await fetchImpl(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(10_000),
    cache: 'no-store',
  })
  if (method === 'DELETE' && (res.status === 204 || res.status === 404)) return null
  const json = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
  if (!res.ok) throw new Error(`Gmail ${res.status}: ${json?.error?.message ?? 'bez odpovědi'}`.slice(0, 300))
  return json
}

export async function createGmailDraft(input: GmailDraftInput, fetchImpl: Fetch = fetch): Promise<GmailDraft> {
  const raw = toBase64Url(buildMimeMessage(input))
  const json = (await call('POST', DRAFTS_URL, { message: { raw } }, fetchImpl)) as {
    id?: string
    message?: { id?: string }
  } | null
  if (!json?.id) throw new Error('Gmail nevrátil id konceptu.')
  return { draftId: json.id, messageId: json.message?.id ?? null }
}

/** Smaže starý koncept, když se zakládá znovu. Už smazaný (odeslaný) koncept není chyba. */
export async function deleteGmailDraft(draftId: string, fetchImpl: Fetch = fetch): Promise<void> {
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(draftId)) return
  await call('DELETE', `${DRAFTS_URL}/${draftId}`, null, fetchImpl)
}

/** Odkaz do Konceptů v Gmailu správného účtu. */
export function gmailDraftsUrl(email: string | null): string {
  const user = email && /^[^\s@]+@[^\s@]+$/.test(email) ? `?authuser=${encodeURIComponent(email)}` : ''
  return `https://mail.google.com/mail/u/${user}#drafts`
}
