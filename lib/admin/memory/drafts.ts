import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import { batchTolerant, q, type AdminRow } from '@/lib/admin/db'
import { stripMarkers } from '@/lib/ai/markers'
import { aiModel, isAiConfigured } from '@/lib/ai/models'
import { MEMORY_PROMPT } from '@/lib/ai/prompts'
import { redactSensitive } from '@/lib/project-activity'
import { memoryAvailable, saveMemory } from './store'
import { MEMORY_KINDS, MEMORY_TEXT_MAX } from './types'

/**
 * Návrhy paměti ze zpráv o práci (AD15, krok 2b).
 *
 * Denní cron: zakázka, na které od posledního zápisu do paměti přibyly
 * zprávy, dostane **jeden** návrh. Ten je vždy `confirmed_by IS NULL` —
 * v UI „Návrh paměti" s Potvrdit / Zahodit, a po 90 dnech propadá.
 *
 * Model nemá nic na výběr kromě tvaru odpovědi: `messages.parse` se Zodem,
 * žádné nástroje (R-084). Když se něco pokazí, běh se tiše vzdá — paměť je
 * nabídka navíc, ne podmínka, aby admin fungoval.
 */

const draftSchema = z.object({
  /** `false` = ze zpráv se nedá vybrat nic, co platí dál. */
  remember: z.boolean(),
  kind: z.enum(MEMORY_KINDS),
  text: z.string().max(MEMORY_TEXT_MAX),
})

/** Kolik zakázek nejvýš za jeden běh — cron má doběhnout, ne vyčerpat limit API. */
const MAX_PROJECTS = 5
/** Kolik zpráv se modelu ukáže. */
const ACTIVITY_LIMIT = 12
/** Pod tolik zpráv se návrh nedělá: z jedné věty nevznikne trvalý poznatek. */
const MIN_ACTIVITY = 2

const MAX_TOKENS = 400

type Candidate = { projectId: string; name: string }

/**
 * Zakázky, kde se od posledního zápisu do paměti něco stalo.
 *
 * `project_activity` (093) ani `project_memory` (111) nemusí na databázi být,
 * proto `batchTolerant` — bez nich se jen nic nenavrhne.
 */
async function candidates(): Promise<Candidate[]> {
  const [rows] = await batchTolerant([
    q`SELECT p.id::text AS id, p.client_name AS name
      FROM projects p
      JOIN project_activity a ON a.project_id = p.id
      WHERE p.closed_at IS NULL
      GROUP BY p.id, p.client_name
      HAVING count(*) >= ${MIN_ACTIVITY}
         AND max(a.created_at) > COALESCE(
               (SELECT max(m.created_at) FROM project_memory m
                 WHERE m.scope = 'project' AND m.ref_id = p.id),
               to_timestamp(0))
      ORDER BY max(a.created_at) DESC
      LIMIT ${MAX_PROJECTS}`,
  ])
  return (rows ?? []).map((r: AdminRow) => ({ projectId: String(r.id), name: String(r.name ?? '') }))
}

async function activityText(projectId: string): Promise<string> {
  const [rows] = await batchTolerant([
    q`SELECT title, body FROM project_activity
      WHERE project_id = ${projectId}
      ORDER BY created_at DESC LIMIT ${ACTIVITY_LIMIT}`,
  ])
  const lines = (rows ?? []).map((r: AdminRow) => {
    const title = stripMarkers(redactSensitive(String(r.title ?? '')).text)
    const body = stripMarkers(redactSensitive(String(r.body ?? '')).text)
    return `- ${title}: ${body}`.slice(0, 600)
  })
  return lines.join('\n')
}

async function askModel(model: string, name: string, text: string) {
  const client = new Anthropic({ timeout: 30_000, maxRetries: 1 })
  const response = await client.messages.parse({
    model,
    max_tokens: MAX_TOKENS,
    system: [{ type: 'text', text: MEMORY_PROMPT, cache_control: { type: 'ephemeral' } }],
    output_config: { effort: 'low', format: zodOutputFormat(draftSchema) },
    messages: [{ role: 'user', content: `Zakázka: ${name}\n\n<zpravy>\n${text}\n</zpravy>` }],
  })
  return response.parsed_output as z.infer<typeof draftSchema> | null
}

export type MemoryDraftRun = { checked: number; created: number }

export async function proposeMemoryDrafts(): Promise<MemoryDraftRun> {
  const run: MemoryDraftRun = { checked: 0, created: 0 }
  if (!isAiConfigured() || !(await memoryAvailable())) return run

  const list = await candidates()
  const model = aiModel('fast')

  for (const candidate of list) {
    run.checked += 1
    try {
      const text = await activityText(candidate.projectId)
      if (text.trim() === '') continue

      const draft = await askModel(model, candidate.name, text)
      if (!draft || !draft.remember || draft.text.trim() === '') continue

      const saved = await saveMemory({
        scope: 'project',
        refId: candidate.projectId,
        kind: draft.kind,
        text: draft.text,
        source: 'activity',
        model,
        // Nikdy potvrzené: větu od modelu musí vidět člověk.
        confirmedBy: null,
      })
      if (saved.ok) run.created += 1
    } catch (err) {
      console.error('[memory-drafts] návrh selhal:', err instanceof Error ? err.name : 'unknown')
    }
  }

  return run
}
