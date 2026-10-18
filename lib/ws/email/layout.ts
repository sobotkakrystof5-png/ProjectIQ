// Rozložení e-mailu v systému Dílky (S15): bílá karta na pozadí `ground`,
// hlavička se znakem 2×2 a jménem firmy, tlačítko jako pilulka, částky a časy
// monospace. Tabulky a inline styly — e-mailové klienty CSS proměnné ani
// třídy neumí, proto jsou barvy tokenů zapsané tady na jednom místě
// (hodnoty z app/ws-tokens.css). Výjimka z „žádné barvy natvrdo“ jen pro e-maily.
//
// Bez importů serveru: stejná funkce dělá náhled v Nastavení i odeslaný e-mail.
// Každý vstup (jméno firmy, texty klienta, údaje zákazníka) se escapuje.

import { usableAccent } from '../accent'
import { accentGradient } from '../accent'
import { loyaltyCardView, type LoyaltyCardStatus } from '../loyalty-card-view'

const C = {
  ground: '#f4f6fb',
  surface: '#ffffff',
  ink: '#0c1a36',
  quiet: '#4a5878',
  line: '#dce7f7',
  navy700: '#23478b',
  navy600: '#2b57a8',
  navy800: '#1b3868',
  navy200: '#b8ceef',
  navy50: '#eef2fb',
  signalBg: '#fff7e8',
  signalLine: '#e19a2c',
  signalInk: '#6b4300',
  reward: '#ffd28a',
} as const

const SANS = "'Instrument Sans', -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif"
const MONO = "'JetBrains Mono', Menlo, Consolas, monospace"

export type EmailButton = { label: string; url: string; primary?: boolean }

export type EmailBlock =
  /** Řádky „popisek — hodnota“ (termín, služba, částka). Hodnota monospace, pokud `mono`. */
  | { kind: 'details'; rows: { label: string; value: string; mono?: boolean }[]; highlight?: boolean }
  | { kind: 'buttons'; items: EmailButton[] }
  /** Seznam (přehledy): hlavní text + vedlejší údaj vpravo. */
  | { kind: 'list'; title: string; items: { main: string; side?: string }[]; empty?: string }
  /** Věrnostní karta. */
  | { kind: 'card'; stamps: number; needed: number; reward: string | null; status?: LoyaltyCardStatus }
  | { kind: 'note'; text: string }
  /** Nadpis s malým štítkem nad ním (novinky ZakazIQ). */
  | { kind: 'headline'; eyebrow?: string; text: string }
  /** Obrázek na celou šířku karty, jen https/http adresa. */
  | { kind: 'image'; url: string; alt: string }

export type EmailContent = {
  brand: { name: string; color: string | null }
  subject: string
  /** Hlavní text (odstavce oddělené prázdným řádkem). */
  body: string
  /** Bloky nad hlavním textem (nadpis, obrázek). */
  intro?: EmailBlock[]
  blocks?: EmailBlock[]
  /** Text pod kartou (kdo e-mail poslal, proč ho dostáváte). */
  footer?: string
  unsubscribeUrl?: string | null
}

export type RenderedEmail = { subject: string; html: string; text: string }

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Jen https (a http pro lokální vývoj) — žádné javascript: ani data:. */
export function safeUrl(url: string): string | null {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null
  } catch {
    return null
  }
}

/** Předmět bez konců řádků (hlavička e-mailu). */
export const cleanSubject = (s: string): string => s.replace(/[\r\n]+/g, ' ').trim().slice(0, 200)

// Odstavce → <p>, řádky → <br>, adresy https → odkaz (po escapování).
function paragraphs(text: string, accent: string): string {
  return text
    .trim()
    .split(/\n{2,}/)
    .map((p) => {
      const html = escapeHtml(p)
        .replace(/https?:\/\/[^\s<]+/g, (m) => `<a href="${m}" style="color:${accent};text-decoration:underline">${m}</a>`)
        .replace(/\n/g, '<br>')
      return `<p style="margin:0 0 16px;font:400 16px/1.55 ${SANS};color:${C.ink}">${html}</p>`
    })
    .join('')
}

function button(b: EmailButton, accent: string): string {
  const url = safeUrl(b.url)
  if (!url) return ''
  const bg = b.primary === false ? C.surface : accent
  const fg = b.primary === false ? accent : '#ffffff'
  const border = b.primary === false ? `1px solid ${accent}` : `1px solid ${accent}`
  return `<a href="${escapeHtml(url)}" style="display:inline-block;margin:0 8px 8px 0;padding:12px 22px;border-radius:999px;border:${border};background:${bg};color:${fg};font:600 15px/20px ${SANS};text-decoration:none">${escapeHtml(b.label)}</a>`
}

function block(b: EmailBlock, accent: string): string {
  switch (b.kind) {
    case 'details': {
      const bg = b.highlight ? C.signalBg : C.navy50
      const border = b.highlight ? `1px dashed ${C.signalLine}` : `1px solid ${C.line}`
      const ink = b.highlight ? C.signalInk : C.ink
      const rows = b.rows
        .filter((r) => r.value)
        .map(
          (r) =>
            `<tr><td style="padding:4px 12px 4px 0;font:400 14px/20px ${SANS};color:${C.quiet};white-space:nowrap;vertical-align:top">${escapeHtml(r.label)}</td>` +
            `<td style="padding:4px 0;font:${r.mono ? `500 14px/20px ${MONO}` : `600 15px/20px ${SANS}`};color:${ink}">${escapeHtml(r.value).replace(/\n/g, '<br>')}</td></tr>`,
        )
        .join('')
      if (!rows) return ''
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;background:${bg};border:${border};border-radius:16px"><tr><td style="padding:14px 18px"><table role="presentation" cellpadding="0" cellspacing="0">${rows}</table></td></tr></table>`
    }
    case 'buttons': {
      const html = b.items.map((x) => button(x, accent)).join('')
      return html ? `<div style="margin:4px 0 16px">${html}</div>` : ''
    }
    case 'list': {
      const items = b.items.length
        ? b.items
            .map(
              (i) =>
                `<tr><td style="padding:8px 0;border-top:1px solid ${C.line};font:400 15px/20px ${SANS};color:${C.ink}">${escapeHtml(i.main)}</td>` +
                `<td align="right" style="padding:8px 0 8px 12px;border-top:1px solid ${C.line};font:500 13px/20px ${MONO};color:${C.quiet};white-space:nowrap">${escapeHtml(i.side ?? '')}</td></tr>`,
            )
            .join('')
        : `<tr><td style="padding:8px 0;border-top:1px solid ${C.line};font:400 15px/20px ${SANS};color:${C.quiet}">${escapeHtml(b.empty ?? 'Nic.')}</td></tr>`
      return `<p style="margin:8px 0 4px;font:500 11px/16px ${MONO};letter-spacing:.08em;text-transform:uppercase;color:${C.quiet}">${escapeHtml(b.title)}</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px">${items}</table>`
    }
    case 'card': {
      const card = loyaltyCardView({ stamps: b.stamps, needed: b.needed, reward: b.reward, status: b.status })
      const rows = Array.from({ length: Math.ceil(card.needed / 5) }, (_, row) => {
        const cells = Array.from({ length: Math.min(5, card.needed - row * 5) }, (_, col) => {
          const filled = row * 5 + col < card.stamps
          const fill = card.status === 'redeemed' ? C.navy200 : '#ffffff'
          const cell = filled
            ? `<td style="width:18px;height:18px;background:${fill};border-radius:5px"></td>`
            : `<td style="width:16px;height:16px;border:1px dashed ${C.navy50};border-radius:5px"></td>`
          return `${cell}<td style="width:6px"></td>`
        }).join('')
        return `<tr>${cells}</tr>`
      }).join('')
      const gradient = accentGradient(accent) ?? `linear-gradient(135deg,${C.navy600},${C.navy800})`
      const statusColor = card.status === 'full' ? C.reward : '#ffffff'
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;background:${accent};background-image:${gradient};border-radius:16px"><tr><td style="padding:16px 18px"><p style="margin:0 0 10px;font:500 11px/16px ${MONO};letter-spacing:.08em;text-transform:uppercase;color:#b8ceef">Věrnostní karta · ${card.progress}</p><table role="presentation" cellpadding="0" cellspacing="0">${rows}</table><p style="margin:10px 0 0;font:600 15px/20px ${SANS};color:${statusColor}">${escapeHtml(card.message)}</p></td></tr></table>`
    }
    case 'note':
      return `<p style="margin:0 0 16px;font:400 14px/1.5 ${SANS};color:${C.quiet}">${escapeHtml(b.text)}</p>`
    case 'headline':
      return (
        (b.eyebrow ? `<p style="margin:0 0 6px;font:500 11px/16px ${MONO};letter-spacing:.08em;text-transform:uppercase;color:${accent}">${escapeHtml(b.eyebrow)}</p>` : '') +
        `<h1 style="margin:0 0 16px;font:600 22px/1.3 ${SANS};color:${C.ink};letter-spacing:-.01em">${escapeHtml(b.text)}</h1>`
      )
    case 'image': {
      const url = safeUrl(b.url)
      if (!url) return ''
      return `<img src="${escapeHtml(url)}" alt="${escapeHtml(b.alt)}" width="510" style="display:block;width:100%;max-width:510px;height:auto;margin:0 0 20px;border:0;border-radius:16px">`
    }
  }
}

function blockText(b: EmailBlock): string {
  switch (b.kind) {
    case 'details':
      return b.rows.filter((r) => r.value).map((r) => `${r.label}: ${r.value}`).join('\n')
    case 'buttons':
      return b.items.map((i) => `${i.label}: ${i.url}`).join('\n')
    case 'list':
      return [b.title.toUpperCase(), ...(b.items.length ? b.items.map((i) => `- ${i.main}${i.side ? ` (${i.side})` : ''}`) : [b.empty ?? 'Nic.'])].join('\n')
    case 'card':
      return `Věrnostní karta: ${loyaltyCardView({ stamps: b.stamps, needed: b.needed, reward: b.reward, status: b.status }).message}`
    case 'note':
      return b.text
    case 'headline':
      return b.eyebrow ? `${b.eyebrow.toUpperCase()}\n${b.text}` : b.text
    case 'image':
      return ''
  }
}

// Znak 2×2 (dílky z loga) v akcentové barvě.
function mark(accent: string): string {
  const cell = (on: boolean) => `<td style="width:8px;height:8px;background:${on ? '#ffffff' : 'transparent'};border-radius:2px"></td>`
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="background:${accent};border-radius:8px"><tr><td style="padding:6px"><table role="presentation" cellpadding="0" cellspacing="2"><tr>${cell(true)}${cell(true)}</tr><tr>${cell(true)}${cell(true)}</tr></table></td></tr></table>`
}

export function renderEmail(content: EmailContent): RenderedEmail {
  const accent = usableAccent(content.brand.color) ?? C.navy700
  const name = content.brand.name.trim() || 'ZakazIQ'
  const subject = cleanSubject(content.subject)
  const blocks = content.blocks ?? []
  const intro = content.intro ?? []
  const unsubscribe = content.unsubscribeUrl ? safeUrl(content.unsubscribeUrl) : null

  const html = `<!doctype html><html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:${C.ground}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.ground}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td style="padding:0 4px 14px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td>${mark(accent)}</td><td style="padding-left:10px;font:600 17px/22px ${SANS};color:${C.ink};letter-spacing:-.01em">${escapeHtml(name)}</td></tr></table></td></tr>
<tr><td style="background:${C.surface};border:1px solid ${C.line};border-radius:24px;padding:28px 24px 12px">
${intro.map((b) => block(b, accent)).join('\n')}
${paragraphs(content.body, accent)}
${blocks.map((b) => block(b, accent)).join('\n')}
</td></tr>
<tr><td style="padding:16px 8px 0;font:400 13px/1.5 ${SANS};color:${C.quiet}">
${content.footer ? `<p style="margin:0 0 6px">${escapeHtml(content.footer)}</p>` : ''}
${unsubscribe ? `<p style="margin:0"><a href="${escapeHtml(unsubscribe)}" style="color:${C.quiet};text-decoration:underline">Nechci dostávat tyhle zprávy</a></p>` : ''}
</td></tr>
</table></td></tr></table></body></html>`

  const text = [
    ...intro.map(blockText).filter(Boolean),
    content.body.trim(),
    ...blocks.map(blockText).filter(Boolean),
    content.footer ?? '',
    unsubscribe ? `Nechci dostávat tyhle zprávy: ${unsubscribe}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')

  return { subject, html, text }
}
