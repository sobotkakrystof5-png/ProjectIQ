'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { Check, CheckCircle2, ExternalLink, Loader2, Star } from 'lucide-react'
import { recordGoogleReviewClick, saveSurveyScore, submitSurvey } from '@/app/portal-actions'
import { npsGroup, SURVEY_AREAS, type PublishMode, type SurveyAreaKey } from '@/lib/admin/survey-model'
import { SURVEY_QUESTION } from '@/lib/admin/survey-email'
import { cn } from '@/lib/utils'

/**
 * Dotazník spokojenosti na jednu minutu (R-119).
 *
 * 1. „Doporučili byste mě?" 0–10 — jediná povinná otázka. Uloží se hned po
 *    výběru (a hned po otevření, když klient klikl na číslo v e-mailu).
 * 2. Čtyři nepovinné oblasti hvězdičkami.
 * 3. Text podle známky: 9–10 reference a souhlas, 7–8 co by udělalo desítku,
 *    0–6 co udělat jinak.
 *
 * Všechny volby jsou nativní přepínače (`type="radio"`), takže fungují
 * šipkami na klávesnici i se čtečkou obrazovky.
 */

type Props = {
  token: string
  /** Známka z odkazu v e-mailu, nebo už uložená. */
  initialScore: number | null
  /** Klient přišel kliknutím na číslo v e-mailu — známku hned uložit. */
  saveInitialScore: boolean
  googleReviewUrl: string | null
}

type Ratings = Partial<Record<SurveyAreaKey, number>>
type SaveState = 'idle' | 'saving' | 'saved' | 'error'
type Done = 'promoter' | 'passive' | 'detractor' | 'already'

const PUBLISH_OPTIONS: { value: PublishMode; label: string }[] = [
  { value: 'named', label: 'Ano, se jménem a firmou' },
  { value: 'anonymous', label: 'Ano, ale bez jména' },
  { value: 'private', label: 'Ne, nezveřejňovat' },
]

const FIELD = cn(
  'w-full rounded-chip border border-navy-100 bg-surface px-3 py-2.5 text-base text-ink sm:text-sm',
  'placeholder:text-quiet focus:outline-none focus:ring-2 focus:ring-navy-700 focus:border-transparent',
)

function StarRow({
  area,
  value,
  onChange,
  disabled,
}: {
  area: (typeof SURVEY_AREAS)[number]
  value: number | undefined
  onChange: (v: number) => void
  disabled: boolean
}) {
  return (
    <fieldset className="flex flex-col gap-1 border-b border-navy-100/60 pb-3 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
      <legend className="sr-only">{area.label}</legend>
      <div aria-hidden className="min-w-0">
        <p className="text-sm font-medium text-ink">{area.label}</p>
        <p className="text-xs text-quiet">{area.hint}</p>
      </div>
      <div className="-ml-2.5 flex items-center sm:ml-0">
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className="group relative flex h-11 w-11 cursor-pointer items-center justify-center">
            <input
              type="radio"
              name={area.key}
              value={n}
              checked={value === n}
              onChange={() => onChange(n)}
              disabled={disabled}
              className="peer sr-only"
              aria-label={`${area.label}: ${n} z 5`}
            />
            <span className="rounded-tiny p-1 peer-focus-visible:ring-2 peer-focus-visible:ring-navy-700">
              <Star
                size={26}
                strokeWidth={1.5}
                className={cn(
                  'transition-colors',
                  value !== undefined && value >= n
                    ? 'fill-navy-700 text-navy-700'
                    : 'text-navy-200 group-hover:text-navy-400',
                )}
              />
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function ThankYou({
  done,
  googleReviewUrl,
  onGoogleReview,
  copied,
}: {
  done: Done
  googleReviewUrl: string | null
  onGoogleReview: () => void
  copied: boolean
}) {
  const content = {
    promoter: {
      title: 'Moc vám děkuji!',
      text: googleReviewUrl
        ? 'Pomohla by mi i krátká recenze na Googlu. Lidé, kteří mě ještě neznají, se podle ní rozhodují.'
        : 'Vážím si toho, že jste si na to našli chvilku.',
    },
    passive: { title: 'Děkuji za odpověď', text: 'S vašimi poznámkami budu pracovat.' },
    detractor: { title: 'Děkuji za upřímnost', text: 'Ozvu se vám, ať to můžeme spolu probrat.' },
    already: { title: 'Dotazník už je odeslaný', text: 'Děkuji za vaše odpovědi i za spolupráci.' },
  }[done]

  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full border border-navy-100 bg-navy-50">
        <CheckCircle2 size={28} strokeWidth={1.5} className="text-navy-700" />
      </div>
      <p className="font-semibold text-ink">{content.title}</p>
      <p className="max-w-sm text-sm text-quiet">{content.text}</p>
      {done === 'promoter' && googleReviewUrl && (
        <div className="mt-2 flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={onGoogleReview}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-navy-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-navy-800"
          >
            Napsat recenzi na Googlu
            <ExternalLink size={15} strokeWidth={1.5} />
          </button>
          {copied && <p className="text-xs text-quiet">Váš text jsem zkopíroval, na Googlu ho stačí vložit.</p>}
        </div>
      )}
    </div>
  )
}

export function SurveyForm({ token, initialScore, saveInitialScore, googleReviewUrl }: Props) {
  const [score, setScore] = useState<number | null>(initialScore)
  const [saveState, setSaveState] = useState<SaveState>(
    initialScore !== null && !saveInitialScore ? 'saved' : 'idle',
  )
  const [ratings, setRatings] = useState<Ratings>({})
  const [improve, setImprove] = useState('')
  const [reference, setReference] = useState('')
  const [publishMode, setPublishMode] = useState<PublishMode | null>(null)
  const [role, setRole] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<Done | null>(null)
  const [copied, setCopied] = useState(false)
  const [isPending, startTransition] = useTransition()
  const lastSaved = useRef<number | null>(null)
  const autoSaved = useRef(false)

  function persistScore(value: number) {
    setSaveState('saving')
    setError(null)
    lastSaved.current = value
    void saveSurveyScore(token, value).then((res) => {
      // Mezitím klient klikl na jiné číslo — výsledek staršího uložení neplatí.
      if (lastSaved.current !== value) return
      if (res.success) {
        setSaveState('saved')
      } else if (res.completed) {
        setDone('already')
      } else {
        setSaveState('error')
        setError(res.error)
      }
    })
  }

  // Klient klikl na číslo v e-mailu: známka se uloží hned, i kdyby dál nic
  // nevyplnil. Ukládá to až prohlížeč, ne otevření odkazu — robot, který
  // odkazy v e-mailech projíždí, tak známku nevyrobí.
  useEffect(() => {
    if (!saveInitialScore || initialScore === null || autoSaved.current) return
    autoSaved.current = true
    persistScore(initialScore)
    // Jen při prvním vykreslení.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function chooseScore(value: number) {
    setScore(value)
    persistScore(value)
  }

  const group = score === null ? null : npsGroup(score)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (score === null) {
      setError('Vyberte prosím číslo od 0 do 10.')
      return
    }
    setError(null)
    startTransition(async () => {
      const res = await submitSurvey(token, {
        nps: score,
        ...ratings,
        improve_text: group !== 'promoter' && improve.trim() ? improve : undefined,
        reference_text: group === 'promoter' && reference.trim() ? reference : undefined,
        publish_mode: group === 'promoter' ? (publishMode ?? 'private') : 'private',
        reviewer_role: group === 'promoter' && publishMode === 'named' && role.trim() ? role : undefined,
      })
      if (res.success) setDone(group ?? 'passive')
      else if (res.completed) setDone('already')
      else setError(res.error)
    })
  }

  function openGoogleReview() {
    if (!googleReviewUrl) return
    // Text reference se zkopíruje, ať ho klient na Googlu jen vloží.
    if (reference.trim() && navigator.clipboard) {
      navigator.clipboard.writeText(reference.trim()).then(
        () => setCopied(true),
        () => setCopied(false),
      )
    }
    void recordGoogleReviewClick(token)
    window.open(googleReviewUrl, '_blank', 'noopener,noreferrer')
  }

  if (done) {
    return <ThankYou done={done} googleReviewUrl={googleReviewUrl} onGoogleReview={openGoogleReview} copied={copied} />
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-7">
      <fieldset className="space-y-3">
        <legend className="mb-3 text-base font-semibold text-ink">{SURVEY_QUESTION}</legend>
        <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-11">
          {Array.from({ length: 11 }, (_, n) => (
            <label key={n} className="relative">
              <input
                type="radio"
                name="nps"
                value={n}
                checked={score === n}
                onChange={() => chooseScore(n)}
                disabled={isPending}
                className="peer sr-only"
                aria-label={`${n} z 10`}
              />
              <span
                className={cn(
                  'flex h-11 cursor-pointer items-center justify-center rounded-chip border font-num text-base font-semibold transition-colors',
                  'peer-focus-visible:ring-2 peer-focus-visible:ring-navy-700 peer-focus-visible:ring-offset-2',
                  score === n
                    ? 'border-navy-700 bg-navy-700 text-white'
                    : 'border-navy-100 bg-navy-50 text-navy-800 hover:border-navy-300',
                )}
              >
                {n}
              </span>
            </label>
          ))}
        </div>
        <div className="flex justify-between text-xs text-quiet">
          <span>0 = určitě ne</span>
          <span>10 = určitě ano</span>
        </div>
        <p className="min-h-5 text-xs text-quiet" aria-live="polite">
          {saveState === 'saving' && (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 size={12} strokeWidth={1.5} className="animate-spin" /> Ukládám známku…
            </span>
          )}
          {saveState === 'saved' && (
            <span className="inline-flex items-center gap-1.5 text-ink">
              <Check size={12} strokeWidth={1.5} /> Známka je uložená. Zbytek je dobrovolný.
            </span>
          )}
        </p>
      </fieldset>

      {score !== null && (
        <>
          <div className="space-y-3">
            <p className="text-sm font-semibold text-ink">
              Jak to šlo? <span className="font-normal text-quiet">(nepovinné)</span>
            </p>
            {SURVEY_AREAS.map((area) => (
              <StarRow
                key={area.key}
                area={area}
                value={ratings[area.key]}
                onChange={(v) => setRatings((prev) => ({ ...prev, [area.key]: v }))}
                disabled={isPending}
              />
            ))}
          </div>

          {group === 'promoter' ? (
            <div className="space-y-4">
              <div>
                <label htmlFor="survey-reference" className="mb-1 block text-sm font-semibold text-ink">
                  Co byste řekli někomu, kdo váhá? <span className="font-normal text-quiet">(nepovinné)</span>
                </label>
                <p className="mb-2 text-xs text-quiet">
                  Třeba co jste řešili předtím, co se změnilo a komu byste mě doporučili.
                </p>
                <textarea
                  id="survey-reference"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  maxLength={3000}
                  rows={4}
                  disabled={isPending}
                  className={cn(FIELD, 'resize-none')}
                />
              </div>

              <fieldset>
                <legend className="mb-1 text-sm font-semibold text-ink">
                  Můžu vaše hodnocení použít jako referenci na webu vizeon.cz?
                </legend>
                {PUBLISH_OPTIONS.map((option) => (
                  <label key={option.value} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-ink">
                    <input
                      type="radio"
                      name="publish_mode"
                      value={option.value}
                      checked={publishMode === option.value}
                      onChange={() => setPublishMode(option.value)}
                      disabled={isPending}
                      className="h-4 w-4 shrink-0 accent-navy-700"
                    />
                    {option.label}
                  </label>
                ))}
                <p className="text-xs text-quiet">Když nic nevyberete, nic nezveřejním.</p>
              </fieldset>

              {publishMode === 'named' && (
                <div>
                  <label htmlFor="survey-role" className="mb-1 block text-sm font-semibold text-ink">
                    Firma nebo pozice <span className="font-normal text-quiet">(nepovinné)</span>
                  </label>
                  <input
                    id="survey-role"
                    type="text"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    maxLength={120}
                    disabled={isPending}
                    placeholder="Např. majitelka kadeřnictví"
                    className={cn(FIELD, 'min-h-11')}
                  />
                </div>
              )}
            </div>
          ) : (
            <div>
              <label htmlFor="survey-improve" className="mb-2 block text-sm font-semibold text-ink">
                {group === 'passive' ? 'Co by z toho udělalo desítku?' : 'Co jsem měl udělat jinak?'}{' '}
                <span className="font-normal text-quiet">(nepovinné)</span>
              </label>
              <textarea
                id="survey-improve"
                value={improve}
                onChange={(e) => setImprove(e.target.value)}
                maxLength={2000}
                rows={4}
                disabled={isPending}
                className={cn(FIELD, 'resize-none')}
              />
              {group === 'detractor' && (
                <p className="mt-2 text-xs text-quiet">Ozvu se vám, ať to můžeme dát do pořádku.</p>
              )}
            </div>
          )}
        </>
      )}

      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}

      {score !== null && (
        <button
          type="submit"
          disabled={isPending}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-navy-700 py-3 text-sm font-semibold text-white transition-colors hover:bg-navy-800 disabled:opacity-50"
        >
          {isPending ? (
            <>
              <Loader2 size={15} strokeWidth={1.5} className="animate-spin" /> Odesílám…
            </>
          ) : (
            'Odeslat'
          )}
        </button>
      )}
    </form>
  )
}
