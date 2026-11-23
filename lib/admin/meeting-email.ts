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

/** „pondělí 17. listopadu" — den hovoru s robotem, pražský čas. */
export function callDay(at: string): string {
  return new Intl.DateTimeFormat('cs-CZ', { timeZone: PRAGUE, weekday: 'long', day: 'numeric', month: 'long' }).format(
    new Date(at),
  )
}

/**
 * Úvod e-mailu. Kryštof ho může přepsat; den hovoru (R-118) je v něm, ať
 * klient hned ví, na co navazujeme.
 */
export function defaultIntro(hasDemo: boolean, lastCallAt: string | null = null): string {
  // Po „Dobrý den," pokračuje věta malým písmenem.
  const opening =
    lastCallAt && !Number.isNaN(Date.parse(lastCallAt))
      ? `navazuji na náš telefonát z ${callDay(lastCallAt)}.`
      : 'děkuji za domluvu.'
  const body = hasDemo
    ? 'Jak jsme se domluvili, posílám ukázku webu, kterou jsme pro vás připravili, a odkaz na naši konzultaci.'
    : 'Posílám odkaz na naši konzultaci.'
  return ['Dobrý den,', '', `${opening} ${body}`, '', 'Těším se na vás.'].join('\n')
}

export type MeetingEmailInput = {
  intro: string
  startsAt: string
  minutes: number
  meetUrl: string
  demoUrl: string | null
  /** Věta pod odkazem, třeba že přijdou připomínky (R-137). Píše ji kód. */
  note?: string | null
}

// Den v týdnu ve 4. pádě a s předložkou: „ve čtvrtek", „ve středu", „na neděli".
const WEEKDAY_ACC: Record<string, string> = {
  pondělí: 'pondělí',
  úterý: 'úterý',
  středa: 'středu',
  čtvrtek: 'čtvrtek',
  pátek: 'pátek',
  sobota: 'sobotu',
  neděle: 'neděli',
}

function dayAndTime(startsAt: string): { weekday: string; rest: string } {
  const at = new Date(startsAt)
  const nominative = new Intl.DateTimeFormat('cs-CZ', { timeZone: PRAGUE, weekday: 'long' }).format(at)
  const date = new Intl.DateTimeFormat('cs-CZ', { timeZone: PRAGUE, day: 'numeric', month: 'long' }).format(at)
  const time = new Intl.DateTimeFormat('cs-CZ', { timeZone: PRAGUE, hour: 'numeric', minute: '2-digit' }).format(at)
  return { weekday: WEEKDAY_ACC[nominative] ?? nominative, rest: `${date} v ${time}` }
}

/** „ve čtvrtek 20. listopadu v 15:00", „v pondělí 23. listopadu v 9:00". */
export function meetingOnDay(startsAt: string): string {
  const { weekday, rest } = dayAndTime(startsAt)
  return `${weekday === 'středu' || weekday === 'čtvrtek' ? 've' : 'v'} ${weekday} ${rest}`
}

/** Po „na": „čtvrtek 20. listopadu v 15:00", „středu 19. listopadu v 15:00". */
export function meetingToDay(startsAt: string): string {
  const { weekday, rest } = dayAndTime(startsAt)
  return `${weekday} ${rest}`
}

/** Věta o připomínkách do pozvánky; bez SMS jen e-mail. */
export function remindersNote(withSms: boolean): string {
  return withSms
    ? 'Den předem a těsně před začátkem vám pošlu připomínku e-mailem a SMS.'
    : 'Den předem a hodinu před začátkem vám pošlu připomínku e-mailem.'
}

/**
 * Úvod pozvánky na schůzku založenou z kalendáře (R-137). Kryštof ho před
 * odesláním upraví; termín je v něm proto, aby šel přepsat i s ním.
 */
export function calendarIntro(startsAt: string, hasDemo: boolean): string {
  const demo = hasDemo ? ' Ukázku webu si můžete otevřít už teď, odkaz je taky níže.' : ''
  return [
    'Dobrý den,',
    '',
    `děkuji za domluvu. Schůzku máme ${meetingOnDay(startsAt)} přes Google Meet. Odkaz najdete níže, nic instalovat nemusíte.`,
    '',
    `Doporučuji připojit se z počítače, ať dobře vidíte, co budu ukazovat.${demo}`,
    '',
    'Těším se na vás.',
  ].join('\n')
}

// ─── Připomínky (R-137) ───────────────────────────────────────────────────────
// Skládají se až při odeslání z aktuálního času schůzky a z aktuálního `now`,
// takže po přesunu termínu i po zpožděném odeslání říkají pravdu.

export type ReminderKind = 'h24' | 'h1' | 'm10' | 'changed'

function pragueDay(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: PRAGUE }).format(d)
}

function pragueTime(d: Date): string {
  return new Intl.DateTimeFormat('cs-CZ', { timeZone: PRAGUE, hour: 'numeric', minute: '2-digit' }).format(d)
}

/** „dnes v 15:00", „zítra v 15:00", jinak „ve čtvrtek 20. listopadu v 15:00". */
export function relativeWhen(startsAt: string, now: Date): string {
  const at = new Date(startsAt)
  const day = pragueDay(at)
  if (day === pragueDay(now)) return `dnes v ${pragueTime(at)}`
  if (day === pragueDay(new Date(now.getTime() + 86_400_000))) return `zítra v ${pragueTime(at)}`
  return meetingOnDay(startsAt)
}

/** Krátký tvar pro SMS: „dnes v 15:00", „zítra v 15:00", „čt 20.11. v 15:00". */
function shortWhen(startsAt: string, now: Date): string {
  const rel = relativeWhen(startsAt, now)
  if (rel.startsWith('dnes') || rel.startsWith('zítra')) return rel
  const at = new Date(startsAt)
  const wd = new Intl.DateTimeFormat('cs-CZ', { timeZone: PRAGUE, weekday: 'short' }).format(at)
  const dm = new Intl.DateTimeFormat('cs-CZ', { timeZone: PRAGUE, day: 'numeric', month: 'numeric' })
    .format(at)
    .replace(/\s/g, '')
  return `${wd} ${dm} v ${pragueTime(at)}`
}

/** „za hodinu", „za 25 minut", „právě teď" — nad 10 minut zaokrouhleno na 5. */
function minutesUntil(startsAt: string, now: Date): string {
  const min = Math.round((new Date(startsAt).getTime() - now.getTime()) / 60_000)
  if (min >= 50) return 'za hodinu'
  if (min <= 2) return 'právě teď'
  const rounded = min < 10 ? min : Math.round(min / 5) * 5
  return `za ${rounded} minut`
}

export function reminderSubject(kind: ReminderKind, startsAt: string, now: Date): string {
  const time = pragueTime(new Date(startsAt))
  switch (kind) {
    case 'h24':
      return `Připomínka: naše schůzka ${relativeWhen(startsAt, now)}`
    case 'h1':
    case 'm10': {
      const soon = minutesUntil(startsAt, now)
      return soon === 'právě teď' ? `Začínáme (${time})` : `Začínáme ${soon} (${time})`
    }
    case 'changed':
      return `Schůzku přesouváme na ${meetingToDay(startsAt)}`
  }
}

export function reminderIntro(kind: ReminderKind, startsAt: string, now: Date): string {
  switch (kind) {
    case 'h24':
      return [
        'Dobrý den,',
        '',
        `připomínám naši schůzku ${relativeWhen(startsAt, now)}. Spojíme se přes Google Meet, odkaz je níže.`,
        '',
        'Doporučuji připojit se z počítače, ať dobře vidíte, co budu ukazovat.',
        '',
        'Kdyby vám čas nevyhovoval, odpovězte prosím na tento e-mail a domluvíme jiný.',
      ].join('\n')
    case 'h1':
    case 'm10': {
      const soon = minutesUntil(startsAt, now)
      const lead = soon === 'právě teď' ? 'naše schůzka právě začíná' : `${soon} začíná naše schůzka`
      return ['Dobrý den,', '', `${lead}. Stačí kliknout na tlačítko níže a jste připojení.`].join('\n')
    }
    case 'changed':
      return [
        'Dobrý den,',
        '',
        `naši schůzku přesouváme na ${meetingToDay(startsAt)}. Odkaz na připojení zůstává stejný.`,
        '',
        'V příloze je soubor do kalendáře s novým časem.',
      ].join('\n')
  }
}

function plainLength(s: string): number {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').length
}

/**
 * Text SMS (diakritiku odstraní až `toSmsText`). Vybere se první varianta,
 * která se vejde do jedné SMS, ať odkaz na schůzku nikdy neusekne.
 */
export function reminderSms(kind: ReminderKind, startsAt: string, meetUrl: string, now: Date): string {
  const when = shortWhen(startsAt, now)
  const time = pragueTime(new Date(startsAt))
  const signs = ['Kryštof Sobotka, VIZEON', 'Kryštof, VIZEON', 'VIZEON']
  let bodies: string[]
  switch (kind) {
    case 'h24':
      bodies = [`Dobrý den, připomínám naši schůzku ${when} přes Google Meet: ${meetUrl}`, `Schůzka ${when}: ${meetUrl}`]
      break
    case 'h1':
    case 'm10': {
      const soon = minutesUntil(startsAt, now)
      const lead =
        soon === 'právě teď' ? `Právě začínáme (${time})` : `${soon[0].toUpperCase()}${soon.slice(1)} začínáme (${time})`
      bodies = [`${lead}. Připojte se tady: ${meetUrl}`, `${lead}: ${meetUrl}`]
      break
    }
    case 'changed':
      bodies = [
        `Dobrý den, naši schůzku přesouváme na ${when}. Odkaz zůstává: ${meetUrl}`,
        `Schůzka je nově ${when}: ${meetUrl}`,
      ]
      break
  }
  for (const body of bodies) {
    for (const sign of signs) {
      const text = `${body} ${sign}`
      if (plainLength(text) <= 160) return text
    }
  }
  return bodies[bodies.length - 1]
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
  const note = input.note?.trim() || null

  const text = [
    intro,
    '',
    `Kdy: ${when}`,
    `Připojit se: ${meet}`,
    'Stačí kliknout na odkaz ve správný čas.',
    ...(note ? [note] : []),
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
${note ? `<p style="margin:8px 0 0;font-size:13px;color:${C.quiet}">${escapeHtml(note)}</p>` : ''}
</td></tr></table>
${demo ? p(`Ukázka vašeho webu: ${link(demo, demo)}`) : ''}
${p(`Náš web: ${link(VIZEON_WEB, 'vizeon.cz')}`)}
<p style="margin:18px 0 0">${SIGNATURE.map(escapeHtml).join('<br>')}</p>
</div></body></html>`

  return { text, html }
}
