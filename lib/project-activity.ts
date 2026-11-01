import { z } from 'zod'

// Aktivita zakázky (KP03): sdílené typy, validace, zakrývání citlivých řetězců
// a skládání časové osy. Čisté funkce bez DB a sítě, aby šly testovat.

export const ACTIVITY_TITLE_MAX = 160
export const ACTIVITY_BODY_MAX = 4000

export const ACTIVITY_KINDS = ['done', 'in_progress', 'question'] as const
export type ActivityKind = (typeof ACTIVITY_KINDS)[number]

export const ACTIVITY_KIND_LABELS: Record<ActivityKind, string> = {
  done: 'Hotovo',
  in_progress: 'Rozpracováno',
  question: 'Otázka',
}

/** Hodnoty z hlášení (`hotovo` / `rozpracováno` / `otázka`) na interní druh. */
export const REPORT_KIND_INPUT = ['hotovo', 'rozpracováno', 'otázka'] as const
export type ReportKindInput = (typeof REPORT_KIND_INPUT)[number]
const REPORT_KIND_MAP: Record<ReportKindInput, ActivityKind> = {
  hotovo: 'done',
  rozpracováno: 'in_progress',
  otázka: 'question',
}
export const reportKindToActivityKind = (kind: ReportKindInput): ActivityKind => REPORT_KIND_MAP[kind]

export type ActivityStatus = 'draft' | 'published' | 'rejected'
export type ActivitySource = 'manual' | 'claude_code' | 'system'

export interface ProjectActivityRow {
  id: string
  project_id: string
  status: ActivityStatus
  source: ActivitySource
  kind: ActivityKind
  title: string
  body: string
  contains_sensitive: boolean
  created_at: Date | string
  updated_at: Date | string
  published_at: Date | string | null
  published_by: string | null
}

export const activityInputSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Napište prosím nadpis.')
    .max(ACTIVITY_TITLE_MAX, `Nadpis může mít nejvýše ${ACTIVITY_TITLE_MAX} znaků.`),
  body: z
    .string()
    .trim()
    .min(1, 'Napište prosím text zprávy.')
    .max(ACTIVITY_BODY_MAX, `Text může mít nejvýše ${ACTIVITY_BODY_MAX} znaků.`),
  kind: z.enum(ACTIVITY_KINDS).default('done'),
})
export type ActivityInput = z.infer<typeof activityInputSchema>

/** Vstup z hlášení Claude Code (KP04). */
export const reportInputSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1)
    .max(ACTIVITY_TITLE_MAX),
  body: z
    .string()
    .trim()
    .min(1)
    .max(ACTIVITY_BODY_MAX),
  kind: z.enum(REPORT_KIND_INPUT).default('hotovo'),
})

// --- Zakrývání citlivých řetězců ---------------------------------------------

/** Čím se nahradí zakrytý úsek. Zpráva s ním nejde schválit (viz hasRedactionMarker). */
export const REDACTION_MARK = '[skryto]'

const SENSITIVE_PATTERNS: RegExp[] = [
  // JWT (tři části začínající eyJ…)
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
  // Hlavička Authorization
  /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/gi,
  // Klíče: OpenAI/Anthropic sk-…, Stripe/ZakazIQ sk_live_/pk_live_/rk_…, GitHub, Slack, AWS, agentní klíč
  /\bsk-[A-Za-z0-9_-]{16,}/g,
  /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9_]{10,}/g,
  /\bzk_agent_[A-Za-z0-9_]{10,}/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  // Connection stringy s přihlašovacími údaji: schéma://uživatel:heslo@host…
  /\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:[^\s@/]+@[^\s]+/gi,
  // Řádky z .env: NÁZEV_PROMĚNNÉ=hodnota na začátku řádku
  /^[ \t]*(?:export[ \t]+)?[A-Z][A-Z0-9_]{2,}[ \t]*=[ \t]*\S.*$/gm,
  // Absolutní cesty v domovské složce (macOS, Linux, Windows)
  /\/Users\/[^\s/'"`]+(?:\/[^\s'"`]*)?/g,
  // /home/ vyžaduje aspoň dvě úrovně, aby se nezakrývala běžná adresa stránky „/home“
  /\/home\/[^\s/'"`]+\/[^\s'"`]*/g,
  /\b[A-Za-z]:\\Users\\[^\s\\'"`]+(?:\\[^\s'"`]*)?/g,
]

export interface RedactionResult {
  text: string
  /** Našlo se (a bylo zakryto) něco, co vypadá jako tajný údaj nebo soukromá cesta. */
  found: boolean
}

/** Zakryje podezřelé řetězce. Běžná česká věta zůstává beze změny. */
export function redactSensitive(input: string): RedactionResult {
  let text = input
  let found = false
  for (const pattern of SENSITIVE_PATTERNS) {
    text = text.replace(pattern, () => {
      found = true
      return REDACTION_MARK
    })
  }
  return { text, found }
}

export const hasRedactionMarker = (text: string): boolean => text.includes(REDACTION_MARK)

export interface PreparedActivity {
  title: string
  body: string
  kind: ActivityKind
  /** Nesmí se schválit jedním klikem: něco se zakrylo, nebo v textu zbývá značka. */
  containsSensitive: boolean
}

/** Zakryje citlivé řetězce v nadpisu i textu a spočítá příznak pro uložení. */
export function prepareActivity(input: ActivityInput): PreparedActivity {
  const title = redactSensitive(input.title)
  const body = redactSensitive(input.body)
  return {
    title: title.text,
    body: body.text,
    kind: input.kind,
    containsSensitive: title.found || body.found || hasRedactionMarker(title.text) || hasRedactionMarker(body.text),
  }
}

export const canApprove = (row: Pick<ProjectActivityRow, 'status' | 'contains_sensitive'>): boolean =>
  row.status === 'draft' && !row.contains_sensitive

// --- Časová osa --------------------------------------------------------------

export interface TimelineProgress {
  id: string
  progress_from: number
  progress_to: number
  description: string
  created_at: Date | string
}

export interface TimelineActivity {
  id: string
  kind: ActivityKind
  title: string
  body: string
  /** Pro klienta datum zveřejnění, ne vznik konceptu. */
  published_at: Date | string
}

export type TimelineEntry =
  | { type: 'progress'; id: string; at: Date | string; progress: TimelineProgress }
  | { type: 'activity'; id: string; at: Date | string; activity: TimelineActivity }

const time = (value: Date | string): number => new Date(value).getTime()

/** Jedna osa od nejnovějšího; při shodě času jde aktivita před postupem. Dvojí id se vynechá. */
export function buildTimeline(progress: TimelineProgress[], activity: TimelineActivity[]): TimelineEntry[] {
  const entries: TimelineEntry[] = []
  const seen = new Set<string>()
  for (const a of activity) {
    const key = `activity:${a.id}`
    if (seen.has(key)) continue
    seen.add(key)
    entries.push({ type: 'activity', id: a.id, at: a.published_at, activity: a })
  }
  for (const p of progress) {
    const key = `progress:${p.id}`
    if (seen.has(key)) continue
    seen.add(key)
    entries.push({ type: 'progress', id: p.id, at: p.created_at, progress: p })
  }
  return entries.sort((x, y) => {
    const diff = time(y.at) - time(x.at)
    if (diff !== 0) return diff
    return x.type === y.type ? 0 : x.type === 'activity' ? -1 : 1
  })
}
