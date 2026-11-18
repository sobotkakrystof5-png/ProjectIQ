'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Star, ChevronDown, ChevronRight, Clock, Copy, Check, Trash2,
  Link2, Quote, ShieldCheck, Loader2, Inbox,
} from 'lucide-react'
import { deleteProjectSurvey, setSurveyFollowUp } from '@/app/closed-actions'
import { getSurveyUrl, cn } from '@/lib/utils'
import { buildReference, referenceAsJson, referenceAsText } from '@/lib/admin/reference'
import {
  answeredRatings, areaAverages, inPeriod, npsBreakdown, npsGroup, npsScore, ratingAverage,
  unhandledDetractors, SURVEY_PERIODS, type SurveyPeriod, type SurveyWithProject,
} from '@/lib/admin/survey-model'
import { Badge } from '@/components/ui/badge'
import { toneVariant, type AdminTone } from '@/lib/admin-status'
import { ContactActions } from '@/components/admin/contact-actions'
import { toast } from '@/components/ui/toast'
import type { ClosedProject } from '@/lib/types'

/**
 * Hodnocení od klientů (R-119): souhrn NPS za období, průměr čtyř oblastí,
 * nespokojení, kterým se ještě nikdo neozval, a odpovědi po zakázkách.
 */

interface Props {
  projects: ClosedProject[]
  surveys: SurveyWithProject[]
}

const fmt1 = (n: number) => n.toLocaleString('cs-CZ', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

const formatDay = (value: string) =>
  new Date(value).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' })

const NPS_TONE: Record<'promoter' | 'passive' | 'detractor', AdminTone> = {
  promoter: 'success',
  passive: 'neutral',
  detractor: 'signal',
}

function ScoreBadge({ survey }: { survey: SurveyWithProject }) {
  if (survey.nps !== null) {
    return (
      <Badge variant={toneVariant(NPS_TONE[npsGroup(survey.nps)])} className="font-num">
        {survey.nps} z 10
      </Badge>
    )
  }
  const avg = ratingAverage(survey)
  return (
    <span className="inline-flex items-center gap-1.5 font-num text-sm font-semibold text-ink">
      <Star size={15} strokeWidth={1.5} className="fill-navy-700 text-navy-700" />
      {avg === null ? '—' : fmt1(avg)}
    </span>
  )
}

function Stars({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`${value} z 5`}>
      {[1, 2, 3, 4, 5].map(n => (
        <Star
          key={n}
          size={15}
          strokeWidth={1.5}
          className={cn(value >= n ? 'fill-navy-700 text-navy-700' : 'text-navy-200')}
        />
      ))}
    </div>
  )
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-chip border border-navy-100 bg-navy-50 px-3 text-xs font-medium text-navy-700 transition-colors hover:bg-navy-100"
    >
      {copied ? <Check size={13} strokeWidth={1.5} /> : <Copy size={13} strokeWidth={1.5} />}
      {copied ? 'Zkopírováno' : label}
    </button>
  )
}

// ─── Souhrn ─────────────────────────────────────────────────────────────────

function SurveySummary({ surveys }: { surveys: SurveyWithProject[] }) {
  const [period, setPeriod] = useState<SurveyPeriod>('12m')
  const shown = useMemo(() => inPeriod(surveys, period), [surveys, period])
  const scores = shown.map(s => s.nps).filter((n): n is number => n !== null)
  const nps = npsScore(scores)
  const groups = npsBreakdown(scores)
  const areas = areaAverages(shown)
  const filled = areas.filter(a => a.avg !== null)
  const weakest =
    filled.length >= 2
      ? filled.reduce((min, a) => (a.avg! < min.avg! ? a : min))
      : null
  const strongest =
    filled.length >= 2
      ? filled.reduce((max, a) => (a.avg! > max.avg! ? a : max))
      : null
  const showWeakest = weakest && strongest && strongest.avg! - weakest.avg! >= 0.3

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Období">
        {SURVEY_PERIODS.map(p => (
          <button
            key={p.key}
            type="button"
            aria-pressed={period === p.key}
            onClick={() => setPeriod(p.key)}
            className={cn(
              'min-h-11 rounded-full px-4 text-sm font-medium transition-colors',
              period === p.key ? 'bg-navy-700 text-white' : 'text-quiet hover:bg-navy-50 hover:text-ink',
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,14rem)_1fr]">
        <div className="rounded-chip border border-navy-100 bg-surface p-4">
          <p className="text-sm text-quiet">Doporučili by vás (NPS)</p>
          <p className="mt-1 font-num text-3xl font-semibold text-ink">
            {nps === null ? '—' : nps > 0 ? `+${nps}` : nps}
          </p>
          <p className="mt-1 text-xs text-quiet">
            {scores.length === 0
              ? 'Za tohle období zatím nikdo neodpověděl.'
              : `Doporučují ${groups.promoter} · neutrální ${groups.passive} · nespokojení ${groups.detractor}`}
          </p>
        </div>

        <div className="rounded-chip border border-navy-100 bg-surface p-4">
          <p className="text-sm text-quiet">Průměr oblastí</p>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
            {areas.map(a => (
              <div key={a.key}>
                <dt className="text-xs text-quiet">{a.label}</dt>
                <dd className="font-num text-lg font-semibold text-ink">
                  {a.avg === null ? '—' : fmt1(a.avg)}
                  {a.avg !== null && <span className="text-xs font-normal text-quiet"> / 5</span>}
                </dd>
              </div>
            ))}
          </dl>
          {showWeakest && (
            <p className="mt-3 text-xs text-ink">
              Nejslabší oblast: <strong>{weakest!.label}</strong> ({fmt1(weakest!.avg!)} z 5).
            </p>
          )}
        </div>
      </div>
      <p className="text-xs text-quiet">
        NPS je podíl doporučujících (9–10) minus podíl nespokojených (0–6), od −100 do +100.
      </p>
    </div>
  )
}

// ─── Nespokojení ────────────────────────────────────────────────────────────

function Detractors({ surveys }: { surveys: SurveyWithProject[] }) {
  const router = useRouter()
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [, start] = useTransition()
  const list = unhandledDetractors(surveys).filter(s => !hidden.has(s.id)) as SurveyWithProject[]

  if (list.length === 0) return null

  function markDone(survey: SurveyWithProject) {
    setHidden(prev => new Set(prev).add(survey.id))
    start(async () => {
      try {
        await setSurveyFollowUp(survey.id, true)
      } catch {
        setHidden(prev => {
          const next = new Set(prev)
          next.delete(survey.id)
          return next
        })
        toast.error('Nepodařilo se to uložit. Zkuste to prosím znovu.')
        return
      }
      toast.success('Označeno, že jste se ozval.', {
        undo: () =>
          start(async () => {
            await setSurveyFollowUp(survey.id, false)
            setHidden(prev => {
              const next = new Set(prev)
              next.delete(survey.id)
              return next
            })
            router.refresh()
          }),
      })
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-ink">Nespokojení, kterým jste se ještě neozval</h3>
      <ul className="flex flex-col gap-3">
        {list.map(s => (
          <li key={s.id} className="space-y-3 rounded-chip border border-navy-100 bg-surface p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-ink">{s.client_name ?? s.project_title}</p>
                <p className="text-xs text-quiet">
                  {s.project_title} · {formatDay(s.created_at)}
                  {!s.completed_at && ' · zbytek dotazníku nevyplnil'}
                </p>
              </div>
              <ScoreBadge survey={s} />
            </div>
            {s.improve_text && (
              <p className="whitespace-pre-wrap rounded-chip bg-navy-50 p-3 text-sm text-ink">{s.improve_text}</p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <ContactActions phone={s.client_phone} email={s.client_email} variant="row" />
              <button
                type="button"
                onClick={() => markDone(s)}
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-navy-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-navy-800"
              >
                <Check size={15} strokeWidth={1.5} />
                Ozval jsem se
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ─── Odpověď u zakázky ──────────────────────────────────────────────────────

const PUBLISH_LABEL = {
  named: 'Souhlasí se zveřejněním se jménem',
  anonymous: 'Souhlasí se zveřejněním bez jména',
  private: 'Nechce nic zveřejňovat',
} as const

function SurveyResult({
  survey,
  project,
  onDelete,
  isDeleting,
}: {
  survey: SurveyWithProject
  project: ClosedProject
  onDelete: () => void
  isDeleting: boolean
}) {
  const ratings = answeredRatings(survey)
  // Bez souhlasu klienta se reference nenabídne vůbec (AD16).
  const reference = useMemo(() => buildReference(survey, project), [survey, project])

  const fullText = useMemo(() => {
    const lines = [
      `Dotazník spokojenosti — ${project.title}`,
      ...(survey.nps !== null ? [`Doporučil by: ${survey.nps}/10`] : []),
      ...ratings.map(r => `${r.label}: ${r.value}/5`),
    ]
    if (survey.improve_text) lines.push('', `Co zlepšit: ${survey.improve_text}`)
    if (survey.reference_text) lines.push('', `Reference: ${survey.reference_text}`)
    return lines.join('\n')
  }, [survey, project.title, ratings])

  return (
    <div className="space-y-4 border-t border-navy-100 bg-navy-50/60 px-5 py-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ScoreBadge survey={survey} />
          {!survey.completed_at && <span className="text-xs text-quiet">Jen známka, zbytek nevyplnil.</span>}
        </div>
        <div className="flex items-center gap-2">
          <CopyButton text={fullText} label="Kopírovat vše" />
          <button
            type="button"
            onClick={onDelete}
            disabled={isDeleting}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-chip border border-danger/30 bg-danger/5 px-3 text-xs font-medium text-danger transition-colors hover:bg-danger/10 disabled:opacity-50"
          >
            {isDeleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} strokeWidth={1.5} />}
            Smazat
          </button>
        </div>
      </div>

      {ratings.length > 0 && (
        <div className="grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
          {ratings.map(r => (
            <div key={r.key} className="flex items-center justify-between gap-3">
              <span className="text-sm text-ink">{r.label}</span>
              <div className="flex items-center gap-2">
                <Stars value={r.value} />
                <span className="w-6 text-right font-num text-xs text-quiet">{r.value}/5</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {survey.improve_text && (
        <div className="rounded-chip border border-navy-100 bg-surface p-4">
          <p className="mb-2 text-sm font-medium text-quiet">
            {survey.nps !== null && survey.nps <= 6 ? 'Co měl udělat jinak' : 'Co by udělalo desítku'}
          </p>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{survey.improve_text}</p>
        </div>
      )}

      {survey.reference_text && (
        <div className="rounded-chip border border-navy-100 bg-surface p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-sm font-medium text-quiet">
              <Quote size={13} strokeWidth={1.5} className="text-navy-500" />
              Co klient napsal
            </p>
            <CopyButton text={survey.reference_text} label="Kopírovat" />
          </div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{survey.reference_text}</p>
        </div>
      )}

      {reference ? (
        <div className="rounded-chip border border-navy-100 bg-surface p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-sm font-medium text-quiet">
              <ShieldCheck size={13} strokeWidth={1.5} className="text-navy-600" />
              Reference na web
            </p>
            <div className="flex items-center gap-2">
              <CopyButton text={referenceAsText(reference)} label="Kopírovat text" />
              <CopyButton text={referenceAsJson(reference)} label="Kopírovat pro web" />
            </div>
          </div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{referenceAsText(reference)}</p>
          <p className="mt-2 text-xs text-quiet">Na web to patří tak, jak to klient napsal. Nic k tomu nedoplňujte.</p>
        </div>
      ) : survey.completed_at ? (
        <p className="text-xs text-quiet">Klient zveřejnění neodsouhlasil, jako referenci to použít nejde.</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-quiet">
        <span className="flex items-center gap-1.5">
          <Clock size={12} strokeWidth={1.5} />
          {formatDay(survey.created_at)}
        </span>
        {survey.publish_mode && survey.completed_at && (
          <span className="flex items-center gap-1.5 text-ink">
            <ShieldCheck size={12} strokeWidth={1.5} />
            {PUBLISH_LABEL[survey.publish_mode]}
          </span>
        )}
        {survey.followed_up_at && (
          <span className="flex items-center gap-1.5">
            <Check size={12} strokeWidth={1.5} />
            Ozval jste se {formatDay(survey.followed_up_at)}
          </span>
        )}
      </div>
    </div>
  )
}

/**
 * Co se s dotazníkem děje (AD16). Odkaz se už nemusí kopírovat ručně —
 * připomínka odchází sama po sedmi dnech. Tlačítka pod větou zůstávají
 * pro případ, že se klient ozývá jinudy.
 */
function waitingText(project: ClosedProject): string {
  if (project.survey_requested_at) {
    const zaklad = `Dotazník odešel ${formatDay(project.survey_requested_at)}.`
    return project.survey_reminded_at
      ? `${zaklad} Připomínka ${formatDay(project.survey_reminded_at)}, další už neodejde.`
      : `${zaklad} Když klient neodpoví, za týden odejde jedna připomínka.`
  }
  return 'Dotazník zatím neodešel. Odkaz můžete poslat i ručně.'
}

export function HodnoceniDashboard({ projects, surveys }: Props) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [localSurveys, setLocalSurveys] = useState<SurveyWithProject[]>(surveys)
  const [isPending, startTransition] = useTransition()
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const surveyByProject = useMemo(() => {
    const map = new Map<string, SurveyWithProject>()
    for (const s of localSurveys) if (s.project_id) map.set(s.project_id, s)
    return map
  }, [localSurveys])

  function handleDelete(surveyId: string) {
    if (!confirm('Opravdu smazat tento vyplněný dotazník?')) return
    setDeletingId(surveyId)
    startTransition(async () => {
      await deleteProjectSurvey(surveyId)
      setLocalSurveys(prev => prev.filter(s => s.id !== surveyId))
      setDeletingId(null)
    })
  }

  const answeredCount = projects.filter(p => surveyByProject.has(p.id)).length

  return (
    <div className="space-y-8">
      <SurveySummary surveys={localSurveys} />
      <Detractors surveys={localSurveys} />

      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-box bg-navy-50">
            <Inbox size={24} strokeWidth={1.5} className="text-navy-400" />
          </div>
          <p className="mb-1 font-medium text-ink">Zatím žádné uzavřené zakázky</p>
          <p className="max-w-xs text-sm text-quiet">
            Jakmile zakázku dokončíte, klientovi odejde dotazník a odpověď se objeví tady.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-quiet">
            Odpovědělo {answeredCount} z {projects.length} {projects.length === 1 ? 'uzavřené zakázky' : 'uzavřených zakázek'}
          </p>

          <div className="flex flex-col gap-3">
            {projects.map(project => {
              const survey = surveyByProject.get(project.id)
              const isOpen = openId === project.id
              return (
                <div key={project.id} className="overflow-hidden rounded-chip border border-navy-100 bg-surface">
                  <button
                    type="button"
                    onClick={() => setOpenId(isOpen ? null : project.id)}
                    aria-expanded={isOpen}
                    className="flex min-h-11 w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-navy-50/60"
                  >
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold text-ink">{project.title}</h3>
                      <p className="mt-0.5 text-xs text-quiet">
                        {project.client_name ?? 'Neznámý klient'}
                        {' · '}
                        {new Date(project.closed_at).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      {survey ? (
                        <ScoreBadge survey={survey} />
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-navy-50 px-2.5 py-1 text-xs font-medium text-quiet">
                          <Clock size={12} strokeWidth={1.5} />
                          Čeká na odpověď
                        </span>
                      )}
                      {isOpen
                        ? <ChevronDown size={18} strokeWidth={1.5} className="text-quiet" />
                        : <ChevronRight size={18} strokeWidth={1.5} className="text-quiet" />}
                    </div>
                  </button>

                  {isOpen && (
                    survey ? (
                      <SurveyResult
                        survey={survey}
                        project={project}
                        onDelete={() => handleDelete(survey.id)}
                        isDeleting={isPending && deletingId === survey.id}
                      />
                    ) : (
                      <div className="space-y-3 border-t border-navy-100 bg-navy-50/60 px-5 py-5">
                        <p className="text-sm text-quiet">{waitingText(project)}</p>
                        <div className="flex items-center gap-2">
                          <CopyButton text={getSurveyUrl(project.survey_token)} label="Kopírovat odkaz na dotazník" />
                          <a
                            href={getSurveyUrl(project.survey_token)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex min-h-11 items-center gap-1.5 rounded-chip px-3 text-xs font-medium text-quiet transition-colors hover:bg-navy-50 hover:text-navy-800"
                          >
                            <Link2 size={13} strokeWidth={1.5} />
                            Otevřít
                          </a>
                        </div>
                      </div>
                    )
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
