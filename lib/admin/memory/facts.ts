import 'server-only'
import { batchTolerant, q, type AdminQuery, type AdminRow } from '@/lib/admin/db'
import { stripMarkers } from '@/lib/ai/markers'

/**
 * Fakta z historie (AD15, R-085) — **deterministická vrstva paměti**.
 *
 * Čistě SQL nad tím, co se v adminu stalo. Žádné AI, žádný uložený text:
 * každé číslo se spočítá znovu při každém otevření, takže nemůže zestárnout
 * ani lhát. **Jen tohle smí plnit formuláře.**
 *
 * Druhá vrstva — věty, které napsal člověk nebo model — leží v
 * `lib/admin/memory/store.ts` a do předvyplněného pole se nikdy nedostane.
 * Kdyby se to smíchalo, vymyšlený údaj od modelu by se v adminu tvářil jako
 * historický fakt (B10).
 *
 * **Nesmí spadnout na databázi bez poslední migrace.** `contact_id` přišel
 * se 104, `closed_at` a `time_invested` se 106, `items` na faktuře se 107 —
 * proto `batchTolerant`: co se nepovede, vrátí prázdno a to fakt prostě nemá.
 */

export type InvoiceItemFact = { description: string; quantity: number; unitPrice: number }

export type AdminFacts = {
  /** `contact` = počítáno pro konkrétního člověka, `global` = pro celé podnikání. */
  scope: 'contact' | 'global'
  contactId: string | null
  /** Kolik zakázek do výpočtu vstoupilo. Nula = fakta jsou prázdná. */
  projects: number
  /** Poslední cena u tohohle klienta (Kč). */
  lastPrice: number | null
  /** Druh práce z poslední zakázky. */
  lastServiceType: string | null
  /** Obvyklá hodinová sazba: cena ÷ odpracované hodiny, průměr přes uzavřené. */
  hourlyRate: number | null
  /** Průměrná doba od zadání k uzavření, ve dnech. */
  avgDaysToClose: number | null
  /** Odkud od něj poptávky nejčastěji chodí. */
  typicalSource: string | null
  /** Položky z poslední vystavené faktury — co se u něj fakturuje. */
  lastInvoiceItems: InvoiceItemFact[]
  /** Kanál poslední domluvené konzultace (telefon, Teams…). */
  lastContactChannel: string | null
  /** Obvyklá délka schůzky v minutách. */
  typicalMeetingMinutes: number | null
  /** Poslední zápis klienta — předvyplní novou zakázku. */
  client: { name: string; email: string | null; phone: string | null } | null
}

export const EMPTY_FACTS: AdminFacts = {
  scope: 'global',
  contactId: null,
  projects: 0,
  lastPrice: null,
  lastServiceType: null,
  hourlyRate: null,
  avgDaysToClose: null,
  typicalSource: null,
  lastInvoiceItems: [],
  lastContactChannel: null,
  typicalMeetingMinutes: null,
  client: null,
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function num(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function str(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  return text === '' ? null : text
}

/** Položky faktury z `jsonb`. Co neodpovídá tvaru, se zahodí — je to nápověda, ne doklad. */
function toItems(value: unknown): InvoiceItemFact[] {
  if (!Array.isArray(value)) return []
  const out: InvoiceItemFact[] = []
  for (const raw of value.slice(0, 20)) {
    if (!raw || typeof raw !== 'object') continue
    const item = raw as Record<string, unknown>
    const description = str(item.description)
    const quantity = num(item.quantity)
    const unitPrice = num(item.unitPrice)
    if (description === null || quantity === null || unitPrice === null) continue
    out.push({ description: description.slice(0, 200), quantity, unitPrice })
  }
  return out
}

/**
 * Dotazy pro jednoho klienta. Počítá se za **rodinu** kontaktu — on sám
 * a všechno, co je do něj sloučené (R-095); sloučení nic nepřepisuje, takže
 * bez tohohle by se po sloučení půlka historie ztratila.
 */
function contactQueries(id: string): AdminQuery[] {
  const family = (alias: string) => `${alias} IN (SELECT f.id FROM contacts f WHERE f.id = $1 OR f.merged_into = $1)`
  const projectIds = `(SELECT p2.id FROM projects p2 WHERE ${family('p2.contact_id')})`

  return [
    {
      text: `SELECT p.client_name, p.client_email, p.client_phone, p.service_type
             FROM projects p WHERE ${family('p.contact_id')}
             ORDER BY p.created_at DESC LIMIT 1`,
      params: [id],
    },
    {
      text: `SELECT p.price::float AS price FROM projects p
             WHERE ${family('p.contact_id')} AND p.price IS NOT NULL AND p.price > 0
             ORDER BY p.created_at DESC LIMIT 1`,
      params: [id],
    },
    {
      text: `SELECT count(*)::int AS pocet,
                    round(avg(p.price / nullif(p.time_invested, 0))
                          FILTER (WHERE p.time_invested > 0 AND p.price > 0), 0)::float AS sazba,
                    round(avg(EXTRACT(epoch FROM (p.closed_at - p.created_at)) / 86400)
                          FILTER (WHERE p.closed_at IS NOT NULL), 1)::float AS dny
             FROM projects p WHERE ${family('p.contact_id')}`,
      params: [id],
    },
    {
      text: `SELECT p.source, count(*)::int AS n FROM projects p
             WHERE ${family('p.contact_id')} AND p.source IS NOT NULL AND btrim(p.source) <> ''
             GROUP BY p.source ORDER BY n DESC, p.source LIMIT 1`,
      params: [id],
    },
    {
      text: `SELECT i.items FROM invoices i
             WHERE i.items IS NOT NULL AND i.project_id IN ${projectIds}
             ORDER BY i.issued_on DESC, i.created_at DESC LIMIT 1`,
      params: [id],
    },
    {
      text: `SELECT s.channel FROM consultation_slots s
             WHERE ${family('s.contact_id')}
             ORDER BY s.scheduled_at DESC LIMIT 1`,
      params: [id],
    },
    {
      text: `SELECT round(avg(EXTRACT(epoch FROM (e.ends_at - e.starts_at)) / 60))::int AS minuty
             FROM calendar_events e
             WHERE e.project_id IN ${projectIds}
                OR e.lead_id IN (SELECT l.id FROM client_leads l WHERE ${family('l.contact_id')})`,
      params: [id],
    },
  ]
}

/** Totéž pro celé podnikání — když klienta ještě neznáme. Dva roky zpět, ať to platí dnes. */
function globalQueries(): AdminQuery[] {
  const recent = `p.created_at > now() - interval '2 years'`
  return [
    { text: `SELECT NULL::text AS client_name, NULL::text AS client_email, NULL::text AS client_phone,
                    NULL::text AS service_type`, params: [] },
    { text: `SELECT NULL::float AS price`, params: [] },
    {
      text: `SELECT count(*)::int AS pocet,
                    round(avg(p.price / nullif(p.time_invested, 0))
                          FILTER (WHERE p.time_invested > 0 AND p.price > 0), 0)::float AS sazba,
                    round(avg(EXTRACT(epoch FROM (p.closed_at - p.created_at)) / 86400)
                          FILTER (WHERE p.closed_at IS NOT NULL), 1)::float AS dny
             FROM projects p WHERE ${recent}`,
      params: [],
    },
    {
      text: `SELECT p.source, count(*)::int AS n FROM projects p
             WHERE ${recent} AND p.source IS NOT NULL AND btrim(p.source) <> ''
             GROUP BY p.source ORDER BY n DESC, p.source LIMIT 1`,
      params: [],
    },
    {
      text: `SELECT i.items FROM invoices i WHERE i.items IS NOT NULL
             ORDER BY i.issued_on DESC, i.created_at DESC LIMIT 1`,
      params: [],
    },
    { text: `SELECT s.channel FROM consultation_slots s ORDER BY s.scheduled_at DESC LIMIT 1`, params: [] },
    {
      text: `SELECT round(avg(EXTRACT(epoch FROM (e.ends_at - e.starts_at)) / 60))::int AS minuty
             FROM calendar_events e WHERE e.starts_at > now() - interval '2 years'`,
      params: [],
    },
  ]
}

function assemble(scope: 'contact' | 'global', contactId: string | null, rows: AdminRow[][]): AdminFacts {
  const [last, price, agg, source, items, channel, meeting] = rows
  const head = last?.[0]
  const name = str(head?.client_name)

  return {
    scope,
    contactId,
    projects: num(agg?.[0]?.pocet) ?? 0,
    lastPrice: num(price?.[0]?.price),
    lastServiceType: str(head?.service_type),
    hourlyRate: num(agg?.[0]?.sazba),
    avgDaysToClose: num(agg?.[0]?.dny),
    typicalSource: str(source?.[0]?.source),
    lastInvoiceItems: toItems(items?.[0]?.items),
    lastContactChannel: str(channel?.[0]?.channel),
    typicalMeetingMinutes: num(meeting?.[0]?.minuty),
    client: name === null ? null : { name, email: str(head?.client_email), phone: str(head?.client_phone) },
  }
}

/**
 * Fakta pro jednoho klienta, nebo pro celé podnikání, když kontakt neznáme.
 * Jedna dávka = jedno kolo do databáze (R-092).
 */
export async function loadFacts(contactId: string | null): Promise<AdminFacts> {
  const forContact = typeof contactId === 'string' && UUID.test(contactId)
  const rows = await batchTolerant(forContact ? contactQueries(contactId as string) : globalQueries())
  return assemble(forContact ? 'contact' : 'global', forContact ? (contactId as string) : null, rows)
}

/** Kontakt navázaný na zakázku. `null` = zakázka ho nemá (nebo chybí migrace 104). */
export async function contactOfProject(projectId: string): Promise<string | null> {
  if (!UUID.test(projectId)) return null
  const [rows] = await batchTolerant([
    q`SELECT coalesce(c.merged_into, c.id)::text AS id
      FROM projects p JOIN contacts c ON c.id = p.contact_id
      WHERE p.id = ${projectId} LIMIT 1`,
  ])
  return str(rows?.[0]?.id)
}

/** Kontakt navázaný na hovor. */
export async function contactOfLead(leadId: string): Promise<string | null> {
  if (!UUID.test(leadId)) return null
  const [rows] = await batchTolerant([
    q`SELECT coalesce(c.merged_into, c.id)::text AS id
      FROM client_leads l JOIN contacts c ON c.id = l.contact_id
      WHERE l.id = ${leadId} LIMIT 1`,
  ])
  return str(rows?.[0]?.id)
}

const SOURCE_LABELS: Record<string, string> = {
  manual: 'ruční zápis',
  web_contact_form: 'formulář na webu',
  chatbot: 'chatbot',
  agent: 'agent',
  booking: 'objednávka z webu',
  referral: 'doporučení',
}

const CHANNEL_LABELS: Record<string, string> = {
  phone: 'telefon',
  whatsapp: 'WhatsApp',
  teams: 'Teams',
  meet: 'Google Meet',
}

/** Fakta jako věty pro člověka. Prázdné pole = o klientovi zatím nic nevíme. */
export function factLines(facts: AdminFacts): string[] {
  const lines: string[] = []
  if (facts.lastPrice !== null) lines.push(`Poslední cena ${Math.round(facts.lastPrice).toLocaleString('cs-CZ')} Kč`)
  if (facts.hourlyRate !== null) lines.push(`Obvyklá sazba ${Math.round(facts.hourlyRate).toLocaleString('cs-CZ')} Kč/h`)
  if (facts.avgDaysToClose !== null) lines.push(`Hotovo obvykle za ${facts.avgDaysToClose} dní`)
  if (facts.lastServiceType !== null) lines.push(`Naposledy ${facts.lastServiceType}`)
  if (facts.typicalSource !== null) {
    lines.push(`Nejčastěji přichází přes ${SOURCE_LABELS[facts.typicalSource] ?? facts.typicalSource}`)
  }
  if (facts.lastContactChannel !== null) {
    lines.push(`Naposledy jste mluvili přes ${CHANNEL_LABELS[facts.lastContactChannel] ?? facts.lastContactChannel}`)
  }
  if (facts.typicalMeetingMinutes !== null) lines.push(`Schůzka obvykle ${facts.typicalMeetingMinutes} minut`)
  if (facts.lastInvoiceItems.length > 0) {
    lines.push(`Poslední faktura: ${facts.lastInvoiceItems.map((i) => i.description).join(', ')}`)
  }
  return lines
}

/**
 * Fakta pro prompt asistenta — kompaktní JSON bez `null` hodnot.
 *
 * Záměrně **bez jména, telefonu a e-mailu**: ty už jsou v `<kontext>` a tady
 * by jen zdvojily osobní údaje v požadavku. Prázdná fakta vracejí `''`,
 * takže se do zprávy nepřidá prázdný rámec.
 */
export function factsForPrompt(facts: AdminFacts): string {
  const data: Record<string, unknown> = {}
  if (facts.lastPrice !== null) data.posledni_cena_kc = Math.round(facts.lastPrice)
  if (facts.hourlyRate !== null) data.hodinova_sazba_kc = Math.round(facts.hourlyRate)
  if (facts.avgDaysToClose !== null) data.obvykla_doba_dny = facts.avgDaysToClose
  // Text z databáze (druh práce, popis položky) může nést značku rámce.
  if (facts.lastServiceType !== null) data.posledni_druh_prace = stripMarkers(facts.lastServiceType)
  if (facts.typicalSource !== null) data.typicky_zdroj = stripMarkers(facts.typicalSource)
  if (facts.lastContactChannel !== null) data.posledni_kanal = stripMarkers(facts.lastContactChannel)
  if (facts.typicalMeetingMinutes !== null) data.obvykla_delka_schuzky_min = facts.typicalMeetingMinutes
  if (facts.lastInvoiceItems.length > 0) {
    data.posledni_polozky_faktury = facts.lastInvoiceItems.slice(0, 5).map((i) => stripMarkers(i.description))
  }
  if (facts.projects > 0) data.pocet_zakazek = facts.projects
  if (Object.keys(data).length === 0) return ''
  return `<fakta>\n${JSON.stringify(data)}\n</fakta>`
}
