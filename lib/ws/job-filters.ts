// Filtry a pohled na obrazovce Zakázky (RD06). Čisté funkce bez DB a bez
// závislostí — počítá je server (výběr zakázek, počty) i testy.
//
//  - Čeká na mě: otevřená zakázka v prvním stavu „nová“, nic se s ní ještě nedělo.
//  - Po termínu: otevřená zakázka, jejíž poslední termín už proběhl a žádný další není.
//  - Bez termínu: otevřená zakázka, která žádný termín nemá.
// Otevřená = není uzavřená a její stav není hotovo / zaplaceno / zrušeno.

export const JOB_FILTERS = ['vse', 'ceka', 'po-terminu', 'bez-terminu'] as const
export type JobFilter = (typeof JOB_FILTERS)[number]

export const JOB_FILTER_LABELS: Record<JobFilter, string> = {
  vse: 'Vše',
  ceka: 'Čeká na mě',
  'po-terminu': 'Po termínu',
  'bez-terminu': 'Bez termínu',
}

export const JOB_VIEWS = ['tabule', 'seznam'] as const
export type JobView = (typeof JOB_VIEWS)[number]

/** Stavy, ve kterých už je zakázka vyřízená (shodně s `CLOSED_TYPES` v lib/ws/bookings.ts). */
const CLOSED_STAGE_TYPES = ['done', 'paid', 'cancelled']

export type JobFacts = {
  stageType: string | null
  closed: boolean
  nextStart: Date | null
  lastEnd: Date | null
}

/** Podklady pro filtry z řádku tabule: stav se hledá podle id (bez stavu platí první). */
export function jobFactsFrom(
  job: { stage_id: string | null; closed_at: Date | null; next_start: Date | null; last_end: Date | null },
  stages: readonly { id: string; type: string }[],
): JobFacts {
  const id = job.stage_id ?? stages[0]?.id
  return {
    stageType: stages.find((s) => s.id === id)?.type ?? null,
    closed: job.closed_at !== null,
    nextStart: job.next_start,
    lastEnd: job.last_end,
  }
}

export type JobFlags = { open: boolean; waiting: boolean; overdue: boolean; noTerm: boolean }

export function jobFlags(job: JobFacts, now: Date): JobFlags {
  const open = !job.closed && !CLOSED_STAGE_TYPES.includes(job.stageType ?? '')
  return {
    open,
    waiting: open && job.stageType === 'new',
    overdue: open && job.nextStart === null && job.lastEnd !== null && job.lastEnd.getTime() < now.getTime(),
    noTerm: open && job.nextStart === null && job.lastEnd === null,
  }
}

export function matchesJobFilter(job: JobFacts, filter: JobFilter, now: Date): boolean {
  if (filter === 'vse') return true
  const f = jobFlags(job, now)
  return filter === 'ceka' ? f.waiting : filter === 'po-terminu' ? f.overdue : f.noTerm
}

export function countJobFilters(jobs: readonly JobFacts[], now: Date): Record<JobFilter, number> {
  const out: Record<JobFilter, number> = { vse: jobs.length, ceka: 0, 'po-terminu': 0, 'bez-terminu': 0 }
  for (const job of jobs) {
    const f = jobFlags(job, now)
    if (f.waiting) out.ceka++
    if (f.overdue) out['po-terminu']++
    if (f.noTerm) out['bez-terminu']++
  }
  return out
}

/** Neznámá hodnota z adresy = Vše. */
export function parseJobFilter(raw: string | string[] | undefined | null): JobFilter {
  const v = Array.isArray(raw) ? raw[0] : raw
  return (JOB_FILTERS as readonly string[]).includes(v ?? '') ? (v as JobFilter) : 'vse'
}

/** Bez volby v adrese: telefon seznam (bez vodorovného posunu), počítač tabule. */
export function parseJobView(raw: string | string[] | undefined | null, phone: boolean): JobView {
  const v = Array.isArray(raw) ? raw[0] : raw
  return (JOB_VIEWS as readonly string[]).includes(v ?? '') ? (v as JobView) : phone ? 'seznam' : 'tabule'
}
