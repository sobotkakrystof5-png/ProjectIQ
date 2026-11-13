import 'server-only'
import { adminDb, q, batchTolerant } from '@/lib/admin/db'
import { stripMarkers } from '@/lib/ai/markers'
import { redactSensitive } from '@/lib/project-activity'
import { contactOfLead, contactOfProject, factsForPrompt, loadFacts } from '@/lib/admin/memory/facts'
import { memoryForPrompt } from '@/lib/admin/memory/store'
import { STATUS_LABELS } from '@/lib/types'
import type { ProjectStatus } from '@/lib/types'

/**
 * Kontext pro asistenta — načítá ho **server** (AD14).
 *
 * Do AD14 skládal kontext prohlížeč a posílal ho v těle požadavku. Nešlo tedy
 * ani zaručit, že je pravdivý, ani že neobsahuje víc, než má. Od teď jde
 * z prohlížeče jen odkaz `{ kind, id }` a data se dotáhnou tady.
 *
 * Co se **nikdy** nečte: `pdf_data` faktur, přihlašovací tabulky, klíče
 * (`project_agent_keys`), cokoli z `.env` a cokoli ze schématu `ws`
 * (data klientů Workspace, R-052/R-063). Každý text projde `redactSensitive`
 * — poznámky píše i klient a může v nich být kus connection stringu.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const CONTEXT_KINDS = ['startup', 'project', 'lead'] as const
export type ContextKind = (typeof CONTEXT_KINDS)[number]
export type ContextRef = { kind: ContextKind; id: string }

/** Nejvýš tolik znaků kontextu — ať se z jedné věty nestane požadavek za desítky tisíc tokenů. */
const CONTEXT_MAX = 6000

export type AiContext = {
  /** Text pro model, už zarámovaný a zkrácený. Prázdný řetězec = žádný kontext. */
  text: string
  /** Lidský popis, co asistent zrovna „vidí" — ukazuje ho panel. */
  label: string | null
}

export const EMPTY_CONTEXT: AiContext = { text: '', label: null }

function clean(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  if (!text) return null
  // Pořadí: nejdřív zakrýt tajné, pak zahodit značky rámce. Obojí se dělá
  // nad jednotlivou hodnotou — hotový rámec si to zahodit nesmí.
  return stripMarkers(redactSensitive(text).text)
}

function block(lines: (string | null)[]): string {
  const body = lines.filter(Boolean).join('\n').slice(0, CONTEXT_MAX)
  return body ? `<kontext>\n${body}\n</kontext>` : ''
}

async function startupContext(id: string): Promise<AiContext> {
  const [projects, changelog, improvements] = await batchTolerant([
    q`SELECT name, segment, problem, phase, progress::int AS progress, monetization,
             live_url, currency, planned_investment::float AS planned_investment,
             total_users::int AS total_users, paying_users_pct::float AS paying_users_pct
      FROM startup_projects WHERE id = ${id} LIMIT 1`,
    q`SELECT change_date::text AS change_date, change_type, description
      FROM startup_changelog WHERE startup_project_id = ${id}
      ORDER BY change_date DESC, created_at DESC LIMIT 10`,
    q`SELECT status, content FROM startup_improvements
      WHERE startup_project_id = ${id} AND status <> 'done' ORDER BY created_at ASC LIMIT 20`,
  ])

  const p = projects[0]
  if (!p) return EMPTY_CONTEXT

  const lines = [
    `Startup projekt: ${clean(p.name) ?? '—'}`,
    `Segment: ${clean(p.segment) ?? '—'}`,
    `Problém: ${clean(p.problem) ?? '—'}`,
    `Fáze: ${clean(p.phase) ?? '—'}`,
    `Postup: ${p.progress ?? 0} %`,
    `Monetizace: ${p.monetization ? 'ano' : 'ne'}`,
    clean(p.live_url) ? `Live adresa: ${clean(p.live_url)}` : null,
    p.planned_investment ? `Plánovaná investice: ${p.planned_investment} ${clean(p.currency) ?? ''}`.trim() : null,
    p.total_users !== null && p.total_users !== undefined ? `Uživatelů celkem: ${p.total_users}` : null,
    p.paying_users_pct !== null && p.paying_users_pct !== undefined ? `Platících: ${p.paying_users_pct} %` : null,
  ]

  if (changelog.length) {
    lines.push('', 'Posledních 10 změn:')
    for (const row of changelog) {
      lines.push(`- [${clean(row.change_date)}] ${clean(row.change_type)}: ${clean(row.description) ?? ''}`)
    }
  }
  if (improvements.length) {
    lines.push('', 'Nevyřešené nápady:')
    for (const row of improvements) lines.push(`- [${clean(row.status)}] ${clean(row.content) ?? ''}`)
  }

  return { text: block(lines), label: `Startup: ${clean(p.name) ?? 'projekt'}` }
}

async function projectContext(id: string): Promise<AiContext> {
  const [projects, notes] = await batchTolerant([
    // Jen sloupce, které v `projects` existují od základního schématu nebo
    // z dávno aplikovaných migrací — kontext nesmí padat na databázi, kde
    // ještě neproběhla poslední migrace.
    q`SELECT id::text AS id, client_name, service_type, source, status, progress::int AS progress,
             price::float AS price, deadline::text AS deadline, description, deposit_paid
      FROM projects WHERE id = ${id} LIMIT 1`,
    q`SELECT created_at::text AS created_at, author, content FROM project_notes
      WHERE project_id = ${id} ORDER BY created_at DESC LIMIT 5`,
  ])

  const p = projects[0]
  if (!p) return EMPTY_CONTEXT

  const status = clean(p.status)
  const lines = [
    `Zakázka: ${clean(p.client_name) ?? '—'}`,
    `Identifikátor zakázky: ${clean(p.id)}`,
    `Stav: ${status && status in STATUS_LABELS ? STATUS_LABELS[status as ProjectStatus] : (status ?? '—')}`,
    `Postup: ${p.progress ?? 0} %`,
    clean(p.service_type) ? `Druh práce: ${clean(p.service_type)}` : null,
    clean(p.source) ? `Odkud přišla: ${clean(p.source)}` : null,
    p.price ? `Cena: ${p.price} Kč` : null,
    clean(p.deadline) ? `Termín: ${clean(p.deadline)}` : null,
    p.deposit_paid ? 'Záloha zaplacená: ano' : null,
    clean(p.description) ? `Popis: ${clean(p.description)}` : null,
  ]

  if (notes.length) {
    lines.push('', 'Poslední poznámky:')
    for (const row of notes) {
      lines.push(`- [${clean(row.created_at)}] ${clean(row.author) ?? ''}: ${clean(row.content) ?? ''}`)
    }
  }

  return { text: block(lines), label: `Zakázka: ${clean(p.client_name) ?? 'bez jména'}` }
}

async function leadContext(id: string): Promise<AiContext> {
  const rows = await adminDb`
    SELECT id::text AS id, company_name, contact_name, phone, email, lead_status,
           next_action, next_action_date::text AS next_action_date,
           next_action_time::text AS next_action_time, notes,
           estimated_value::float AS estimated_value
    FROM client_leads WHERE id = ${id} LIMIT 1
  `
  const l = rows[0]
  if (!l) return EMPTY_CONTEXT

  const lines = [
    `Kontakt: ${clean(l.company_name) ?? '—'}`,
    `Identifikátor kontaktu: ${clean(l.id)}`,
    clean(l.contact_name) ? `Jméno: ${clean(l.contact_name)}` : null,
    clean(l.phone) ? `Telefon: ${clean(l.phone)}` : null,
    clean(l.email) ? `E-mail: ${clean(l.email)}` : null,
    `Stav: ${clean(l.lead_status) ?? '—'}`,
    clean(l.next_action) ? `Další krok: ${clean(l.next_action)}` : null,
    clean(l.next_action_date)
      ? `Kdy: ${clean(l.next_action_date)}${clean(l.next_action_time) ? ` ${clean(l.next_action_time)}` : ''}`
      : null,
    l.estimated_value ? `Odhad hodnoty: ${l.estimated_value}` : null,
    clean(l.notes) ? `Poznámky: ${clean(l.notes)}` : null,
  ]

  return { text: block(lines), label: `Kontakt: ${clean(l.company_name) ?? 'bez názvu'}` }
}

/**
 * Dvě vrstvy paměti k témuž kontextu (AD15, R-085).
 *
 * `<fakta>` jsou spočítaná z historie — čísla, kterým se dá věřit.
 * `<pamet>` jsou věty, které napsal člověk nebo model; nepotvrzené nesou
 * značku. Pořadí je schválně tohle: nejdřív doložené, pak domněnky.
 *
 * Selhání se spolkne — asistent má poradit i tehdy, když paměť zrovna není
 * (chybí migrace 111, chybí 104 a tím `contact_id`).
 */
async function memoryBlocks(ref: ContextRef): Promise<string> {
  try {
    if (ref.kind === 'startup') return await memoryForPrompt('global', null)

    const contactId =
      ref.kind === 'project' ? await contactOfProject(ref.id) : await contactOfLead(ref.id)
    const [facts, own, aboutContact] = await Promise.all([
      loadFacts(contactId),
      ref.kind === 'project' ? memoryForPrompt('project', ref.id) : Promise.resolve(''),
      contactId === null ? Promise.resolve('') : memoryForPrompt('contact', contactId),
    ])
    return [factsForPrompt(facts), own, aboutContact].filter(Boolean).join('\n')
  } catch (err) {
    console.error('[ai-context] paměť se nenačetla:', err instanceof Error ? err.name : 'unknown')
    return ''
  }
}

export function isContextRef(value: unknown): value is ContextRef {
  if (!value || typeof value !== 'object') return false
  const ref = value as { kind?: unknown; id?: unknown }
  return (
    typeof ref.kind === 'string' &&
    (CONTEXT_KINDS as readonly string[]).includes(ref.kind) &&
    typeof ref.id === 'string' &&
    UUID.test(ref.id)
  )
}

/** Načte kontext. Neplatný nebo neexistující odkaz vrátí prázdno — nikdy nevyhazuje. */
export async function loadAiContext(ref: ContextRef | null | undefined): Promise<AiContext> {
  if (!ref || !isContextRef(ref)) return EMPTY_CONTEXT
  try {
    const loaded =
      ref.kind === 'startup'
        ? await startupContext(ref.id)
        : ref.kind === 'project'
          ? await projectContext(ref.id)
          : await leadContext(ref.id)
    if (loaded.text === '') return loaded
    const extras = await memoryBlocks(ref)
    return { ...loaded, text: extras === '' ? loaded.text : `${loaded.text}\n${extras}` }
  } catch (err) {
    console.error('[ai-context] načtení kontextu selhalo:', err instanceof Error ? err.name : 'unknown')
    return EMPTY_CONTEXT
  }
}
