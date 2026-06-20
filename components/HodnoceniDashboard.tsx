'use client'

import { useState, useTransition, useMemo } from 'react'
import {
  Star, ChevronDown, ChevronRight, Clock, Copy, Check, Trash2,
  Link2, Quote, ShieldCheck, Loader2, Inbox,
} from 'lucide-react'
import { deleteProjectSurvey } from '@/app/completed-actions'
import { getSurveyUrl, cn } from '@/lib/utils'
import { SURVEY_CATEGORIES, type CompletedProject, type ProjectSurvey } from '@/lib/types'

interface Props {
  projects: CompletedProject[]
  surveys: ProjectSurvey[]
}

function Stars({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <Star
          key={n}
          size={15}
          strokeWidth={1.5}
          className={cn(value >= n ? 'fill-amber-400 text-amber-400' : 'text-slate-300')}
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
      className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-700 bg-brand-50 border border-brand-100 px-2.5 py-1.5 rounded-lg hover:bg-brand-100 transition-colors"
    >
      {copied ? <Check size={13} strokeWidth={2} /> : <Copy size={13} strokeWidth={1.5} />}
      {copied ? 'Zkopírováno' : label}
    </button>
  )
}

function surveyAverage(s: ProjectSurvey): number {
  const sum = SURVEY_CATEGORIES.reduce((acc, c) => acc + (s[c.key] as number), 0)
  return sum / SURVEY_CATEGORIES.length
}

function SurveyResult({
  survey,
  projectTitle,
  onDelete,
  isDeleting,
}: {
  survey: ProjectSurvey
  projectTitle: string
  onDelete: () => void
  isDeleting: boolean
}) {
  const avg = surveyAverage(survey)

  const fullText = useMemo(() => {
    const lines = [
      `Dotazník spokojenosti — ${projectTitle}`,
      ...SURVEY_CATEGORIES.map(c => `${c.label}: ${survey[c.key]}/5`),
      `Průměr: ${avg.toFixed(1)}/5`,
    ]
    if (survey.reference_text) lines.push('', `Reference: ${survey.reference_text}`)
    return lines.join('\n')
  }, [survey, projectTitle, avg])

  return (
    <div className="space-y-4 bg-slate-50/60 border-t border-border px-5 py-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold text-brand-800">{avg.toFixed(1)}</span>
          <span className="text-sm text-muted-foreground">/ 5 průměr</span>
        </div>
        <div className="flex items-center gap-2">
          <CopyButton text={fullText} label="Kopírovat vše" />
          <button
            type="button"
            onClick={onDelete}
            disabled={isDeleting}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 bg-red-50 border border-red-100 px-2.5 py-1.5 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50"
          >
            {isDeleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} strokeWidth={1.5} />}
            Smazat
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5">
        {SURVEY_CATEGORIES.map(c => (
          <div key={c.key} className="flex items-center justify-between gap-3">
            <span className="text-sm text-foreground">{c.label}</span>
            <div className="flex items-center gap-2">
              <Stars value={survey[c.key] as number} />
              <span className="text-xs text-muted-foreground w-6 text-right">{survey[c.key]}/5</span>
            </div>
          </div>
        ))}
      </div>

      {survey.reference_text && (
        <div className="bg-white border border-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <Quote size={13} strokeWidth={1.5} className="text-brand-500" />
              Reference
            </div>
            <CopyButton text={survey.reference_text} label="Kopírovat" />
          </div>
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{survey.reference_text}</p>
        </div>
      )}

      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Clock size={12} strokeWidth={1.5} />
          {new Date(survey.created_at).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' })}
        </span>
        {survey.consent && (
          <span className="flex items-center gap-1.5 text-emerald-600">
            <ShieldCheck size={12} strokeWidth={1.5} />
            Souhlas se zveřejněním udělen
          </span>
        )}
      </div>
    </div>
  )
}

export function HodnoceniDashboard({ projects, surveys }: Props) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [localSurveys, setLocalSurveys] = useState<ProjectSurvey[]>(surveys)
  const [isPending, startTransition] = useTransition()
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const surveyByProject = useMemo(() => {
    const map = new Map<string, ProjectSurvey>()
    for (const s of localSurveys) map.set(s.completed_project_id, s)
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

  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-14 h-14 bg-brand-50 rounded-2xl flex items-center justify-center mb-4">
          <Inbox size={24} strokeWidth={1.5} className="text-brand-400" />
        </div>
        <p className="font-medium text-foreground mb-1">Zatím žádné dokončené zakázky</p>
        <p className="text-sm text-muted-foreground max-w-xs">
          Jakmile dokončíš klientskou zakázku, klientovi přijde dotazník a výsledky se objeví zde.
        </p>
      </div>
    )
  }

  const answeredCount = projects.filter(p => surveyByProject.has(p.id)).length

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {answeredCount} z {projects.length} {projects.length === 1 ? 'zakázky' : 'zakázek'} ohodnoceno
      </p>

      <div className="flex flex-col gap-3">
        {projects.map(project => {
          const survey = surveyByProject.get(project.id)
          const isOpen = openId === project.id
          return (
            <div key={project.id} className="bg-white border border-border rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setOpenId(isOpen ? null : project.id)}
                className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-slate-50/60 transition-colors"
              >
                <div className="min-w-0">
                  <h3 className="font-semibold text-foreground truncate">{project.title}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {project.client_name ?? 'Neznámý klient'}
                    {' · '}
                    {new Date(project.completed_at).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {survey ? (
                    <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-600">
                      <Star size={15} strokeWidth={1.5} className="fill-amber-400 text-amber-400" />
                      {surveyAverage(survey).toFixed(1)}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground bg-slate-100 px-2.5 py-1 rounded-full">
                      <Clock size={12} strokeWidth={1.5} />
                      Čeká na vyplnění
                    </span>
                  )}
                  {isOpen
                    ? <ChevronDown size={18} strokeWidth={1.5} className="text-muted-foreground" />
                    : <ChevronRight size={18} strokeWidth={1.5} className="text-muted-foreground" />}
                </div>
              </button>

              {isOpen && (
                survey ? (
                  <SurveyResult
                    survey={survey}
                    projectTitle={project.title}
                    onDelete={() => handleDelete(survey.id)}
                    isDeleting={isPending && deletingId === survey.id}
                  />
                ) : (
                  <div className="border-t border-border px-5 py-5 space-y-3 bg-slate-50/60">
                    <p className="text-sm text-muted-foreground">
                      Klient zatím dotazník nevyplnil. Odkaz mu byl odeslán emailem při dokončení zakázky —
                      můžeš ho zkopírovat a poslat znovu.
                    </p>
                    <div className="flex items-center gap-2">
                      <CopyButton text={getSurveyUrl(project.survey_token)} label="Kopírovat odkaz na dotazník" />
                      <a
                        href={getSurveyUrl(project.survey_token)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-brand-800 px-2.5 py-1.5 rounded-lg hover:bg-brand-50 transition-colors"
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
  )
}
