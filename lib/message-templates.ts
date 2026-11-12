/**
 * Šablony zpráv pro kontakt jedním klikem (AD10).
 *
 * Šablona **jen plní odkaz** (`sms:`, `mailto:`, `wa.me`) — nic neposílá sama
 * (R-084). Odeslání zůstává v poštovním klientu nebo v telefonu, takže text
 * jde před odesláním přepsat a nikdy se nestane, že by admin poslal zprávu,
 * kterou nikdo neviděl.
 *
 * Soubor je čistý (žádné `server-only`, žádný přístup k databázi) — čte ho
 * i klientská komponenta `components/admin/contact-actions.tsx`.
 *
 * **Žádné vymyšlené údaje** (B10): co není v kontextu, do textu se nedostane.
 * Místa, která musí doplnit člověk, jsou v hranatých závorkách — v e-mailovém
 * klientu je vidět na první pohled, co ještě dopsat.
 */

import { formatPragueShortDateTime } from './prague-time'

export type MessageChannel = 'sms' | 'email' | 'whatsapp'

/**
 * Co šablona ví. Všechno nepovinné: chybějící údaj řádek vynechá.
 *
 * Jméno tu schválně **není**. Česky se oslovuje pátým pádem („pane Nováku")
 * a ten se z „Novák Jan s.r.o." ani z „jan.novak@firma.cz" spolehlivě
 * neudělá — špatně skloněné jméno je horší než obyčejné „Dobrý den,".
 */
export type MessageContext = {
  /** Název zakázky, jak ji klient zná. */
  projectName?: string | null
  /** Termín jako okamžik (ISO), ne hotový text — formát drží jedno místo. */
  at?: string | Date | null
  /** Odkaz na přehled zakázky (`/p/<token>`). */
  portalUrl?: string | null
}

export type MessageTemplate = {
  id: string
  channel: MessageChannel
  /** Co se ukáže v nabídce. Sloveso, ne podstatné jméno. */
  label: string
  /** Předmět e-mailu; u SMS a WhatsAppu se nepoužívá. */
  subject?: (ctx: MessageContext) => string
  body: (ctx: MessageContext) => string
  /** Bez kterých údajů šablona nemá smysl a v nabídce se neukáže. */
  needs?: (keyof MessageContext)[]
}

/** Podpis e-mailu — tytéž údaje, které posílá portfolio e-mail. */
export const EMAIL_SIGNATURE = 'S přáním pěkného dne\nKryštof Sobotka\nTel. +420 604 837 333\ninfo@vizeon.cz'

/** Oslovení — vždy stejné, viz poznámka u `MessageContext`. */
const GREETING = 'Dobrý den,'

/** Termín v krátkém českém tvaru, nebo `null`. */
function when(ctx: MessageContext): string | null {
  return ctx.at ? formatPragueShortDateTime(ctx.at) : null
}

function lines(...parts: (string | null | undefined)[]): string {
  return parts.filter((p): p is string => typeof p === 'string' && p !== '').join('\n\n')
}

export const MESSAGE_TEMPLATES: MessageTemplate[] = [
  {
    id: 'sms-nedovolal',
    channel: 'sms',
    label: 'Nedovolal jsem se',
    body: (ctx) =>
      `${GREETING} tady Kryštof Sobotka. Zkoušel jsem vám volat — ozvěte se mi prosím, až budete mít chvilku.`,
  },
  {
    id: 'sms-potvrzeni',
    channel: 'sms',
    label: 'Potvrdit termín',
    needs: ['at'],
    body: (ctx) => `${GREETING} potvrzuji náš termín ${when(ctx)}. Kryštof Sobotka`,
  },
  {
    id: 'sms-pripomenuti',
    channel: 'sms',
    label: 'Připomenout termín',
    needs: ['at'],
    body: (ctx) =>
      `${GREETING} připomínám náš termín ${when(ctx)}. Kdyby se vám to nehodilo, dejte mi prosím vědět. Kryštof Sobotka`,
  },
  {
    id: 'whatsapp-ozveme-se',
    channel: 'whatsapp',
    label: 'Napsat krátkou zprávu',
    body: (ctx) => {
      const termin = when(ctx)
      return termin
        ? `${GREETING} tady Kryštof Sobotka. Potvrzuji náš termín ${termin}.`
        : `${GREETING} tady Kryštof Sobotka. [Sem napište zprávu.]`
    },
  },
  {
    id: 'email-potvrzeni',
    channel: 'email',
    label: 'Potvrdit termín',
    needs: ['at'],
    subject: () => 'Potvrzení termínu',
    body: (ctx) =>
      lines(
        GREETING,
        `potvrzuji náš termín ${when(ctx)}.${ctx.projectName ? ` Týká se zakázky ${ctx.projectName}.` : ''}`,
        'Kdyby se vám čas nehodil, napište mi a najdeme jiný.',
        EMAIL_SIGNATURE,
      ),
  },
  {
    id: 'email-po-hovoru',
    channel: 'email',
    label: 'Napsat po hovoru',
    subject: () => 'Co jsme si domluvili',
    body: (ctx) =>
      lines(
        GREETING,
        'děkuji za dnešní hovor. Posílám písemně, co jsme si domluvili:',
        '[Sem dopište, co jste domluvili.]',
        EMAIL_SIGNATURE,
      ),
  },
  {
    id: 'email-prehled-zakazky',
    channel: 'email',
    label: 'Poslat přehled zakázky',
    needs: ['portalUrl'],
    subject: (ctx) => (ctx.projectName ? `Přehled zakázky ${ctx.projectName}` : 'Přehled vaší zakázky'),
    body: (ctx) =>
      lines(
        GREETING,
        'na téhle adrese uvidíte, jak zakázka pokračuje. Nemusíte se nikam přihlašovat:',
        ctx.portalUrl ?? null,
        'Odkaz si můžete uložit, platí pořád.',
        EMAIL_SIGNATURE,
      ),
  },
]

/** Šablony jednoho kanálu, u kterých je v kontextu všechno potřebné. */
export function templatesFor(channel: MessageChannel, ctx: MessageContext): MessageTemplate[] {
  return MESSAGE_TEMPLATES.filter(
    (t) =>
      t.channel === channel &&
      (t.needs ?? []).every((key) => {
        const value = ctx[key]
        return value !== null && value !== undefined && value !== ''
      }),
  )
}
