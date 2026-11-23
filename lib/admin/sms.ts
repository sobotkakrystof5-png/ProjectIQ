import 'server-only'

/**
 * SMS klientům přes Odorik.cz (R-137). Odorik už VIZEON má kvůli Growth OS.
 *
 * API: `POST https://www.odorik.cz/api/v1/sms` s `user`, `password`,
 * `recipient` (00420…), `message` a volitelným `sender`. Odpověď je prostý
 * text: `successfully_sent <kredit>`, `successfully_enqueued`, nebo
 * `error <důvod>` (ověřeno v dokumentaci 2026-11-23).
 *
 * Dvě omezení, se kterými kód počítá:
 *  - **Odesílatel** do ČR smí být jen „Odorik.cz", „smsinfo" nebo „5517",
 *    nikdy „VIZEON" ani mobilní číslo. Podpis proto musí být v textu.
 *  - **Odložené odeslání** Odorik umí, ale naplánovanou SMS nejde zrušit —
 *    po přesunu schůzky by klientovi přišel starý čas. SMS proto odchází
 *    až ve chvíli, kdy na ni přijde řada (fronta `meeting_reminders`).
 *
 * Diakritika by SMS přepnula do Unicode a zkrátila ze 160 na 70 znaků,
 * takže text jde bez ní (`toSmsText`).
 */

const ODORIK_SMS_URL = 'https://www.odorik.cz/api/v1/sms'
/** Jedna SMS v GSM 7bit. Delší text by se rozdělil a stál víc. */
export const SMS_MAX = 160

export function smsConfigured(): boolean {
  return Boolean(process.env.ODORIK_API_USER && process.env.ODORIK_API_PASSWORD)
}

export type SmsResult = { ok: true; id: string | null } | { ok: false; error: string; retry: boolean }

// Základní znaková sada GSM 03.38 bez znaků, které zabírají dvě místa.
const GSM_SAFE = /^[A-Za-z0-9 \n.,:;!?'"()+\-/@&%#*=<>_]*$/

/**
 * Text pro SMS: bez diakritiky, bez znaků mimo základní sadu GSM a nejvýš
 * na jednu zprávu. Pomlčky a uvozovky z češtiny se převedou na obyčejné.
 */
export function toSmsText(input: string): string {
  const plain = input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[–—]/g, '-')
    .replace(/[“”„]/g, '"')
    .replace(/[‘’‚]/g, "'")
    .replace(/ /g, ' ')
    .replace(/…/g, '...')
    .split('')
    .map((ch) => (GSM_SAFE.test(ch) ? ch : ''))
    .join('')
    .replace(/[ \t]+/g, ' ')
    .trim()
  return plain.length > SMS_MAX ? plain.slice(0, SMS_MAX - 3).trimEnd() + '...' : plain
}

/** `+420777123456` → `00420777123456` (tvar, který chce Odorik). */
export function odorikRecipient(e164: string): string | null {
  return /^\+[1-9]\d{7,14}$/.test(e164) ? '00' + e164.slice(1) : null
}

/** Chyby, u kterých má smysl to za chvíli zkusit znovu. */
const RETRYABLE = new Set(['gateway_failed'])

export function parseOdorikResponse(status: number, body: string): SmsResult {
  const text = body.trim()
  if (text.startsWith('successfully_sent') || text.startsWith('successfully_enqueued')) {
    return { ok: true, id: null }
  }
  const code = text.startsWith('error ') ? text.slice(6).split(/\s+/)[0] : ''
  if (code === 'low_balance') return { ok: false, error: 'Na účtu Odoriku došel kredit.', retry: false }
  if (code === 'authentication_failed' || code === 'authentication_required') {
    return { ok: false, error: 'Odorik odmítl přihlašovací údaje.', retry: false }
  }
  if (code === 'forbidden_sender') return { ok: false, error: 'Odorik nepovolil odesílatele SMS.', retry: false }
  if (code === 'unsupported_recipient') return { ok: false, error: 'Na tohle číslo Odorik SMS neposílá.', retry: false }
  if (code) return { ok: false, error: `Odorik: ${code}`.slice(0, 200), retry: RETRYABLE.has(code) }
  return { ok: false, error: `Odorik ${status}: ${text || 'bez odpovědi'}`.slice(0, 200), retry: status >= 500 }
}

export async function sendSms(
  input: { to: string; text: string },
  fetchImpl: typeof fetch = fetch,
): Promise<SmsResult> {
  const user = process.env.ODORIK_API_USER
  const password = process.env.ODORIK_API_PASSWORD
  if (!user || !password) return { ok: false, error: 'SMS nejsou nastavené (chybí ODORIK_API_USER).', retry: false }
  const recipient = odorikRecipient(input.to)
  if (!recipient) return { ok: false, error: 'Neplatné telefonní číslo.', retry: false }
  const message = toSmsText(input.text)
  if (!message) return { ok: false, error: 'Prázdná SMS.', retry: false }

  const body = new URLSearchParams({ user, password, recipient, message, user_agent: 'ZakazIQ' })
  const sender = process.env.ODORIK_SMS_SENDER?.trim()
  if (sender) body.set('sender', sender)

  try {
    const res = await fetchImpl(ODORIK_SMS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    })
    return parseOdorikResponse(res.status, await res.text().catch(() => ''))
  } catch (err) {
    return { ok: false, error: `Odorik: ${(err as Error).message}`.slice(0, 200), retry: true }
  }
}
