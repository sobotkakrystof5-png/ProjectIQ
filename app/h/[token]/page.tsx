import { notFound } from 'next/navigation'
import { CheckCircle2 } from 'lucide-react'
import { publicToken } from '@/lib/public-token'
import { loadSurveyPage } from '@/lib/admin/survey-answers'
import { isValidNps } from '@/lib/admin/survey-model'
import { SurveyForm } from '@/components/SurveyForm'

export const revalidate = 0

interface PageProps {
  params: Promise<{ token: string }>
  searchParams: Promise<{ znamka?: string | string[] }>
}

/** `?znamka=7` z odkazu v e-mailu; cokoli jiného se ignoruje. */
function scoreFromUrl(raw: string | string[] | undefined): number | null {
  if (typeof raw !== 'string' || !/^\d{1,2}$/.test(raw)) return null
  const n = Number(raw)
  return isValidNps(n) ? n : null
}

/**
 * Dotazník spokojenosti (R-119). Patří zakázce (migrace 106) a token se při
 * migraci přenesl z Dokončených, takže odkazy z dřív odeslaných e-mailů
 * fungují dál. Otevření stránky nic neukládá — známku z odkazu uloží až
 * formulář v prohlížeči.
 */
export default async function SurveyPage(props: PageProps) {
  const [params, searchParams] = await Promise.all([props.params, props.searchParams])
  // `survey_token` je uuid: neplatný tvar je 404, ne chyba dotazu.
  const token = publicToken(params.token)
  if (!token) notFound()
  const state = await loadSurveyPage(token)
  if (!state) notFound()

  const { project, answer, googleReviewUrl } = state
  const completed = answer?.completed_at != null
  const fromUrl = scoreFromUrl(searchParams.znamka)
  const initialScore = fromUrl ?? answer?.nps ?? null
  const promoter = answer?.nps != null && answer.nps >= 9

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="flex flex-1 items-center justify-center px-4 py-10 sm:py-12">
        <div className="w-full max-w-lg">
          <div className="overflow-hidden rounded-box border border-navy-100 bg-surface shadow-sm">
            <div className="bg-navy-900 px-6 pb-6 pt-7">
              <p className="mb-1.5 text-sm text-navy-200">Dotazník k zakázce</p>
              <h1 className="text-2xl font-semibold text-white">{project.title}</h1>
              {!completed && (
                <p className="mt-1.5 text-sm leading-relaxed text-navy-100">
                  Zabere minutu. Povinná je jen první otázka.
                </p>
              )}
            </div>

            <div className="px-5 py-6 sm:px-6">
              {completed ? (
                <div className="flex flex-col items-center gap-3 py-8 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full border border-navy-100 bg-navy-50">
                    <CheckCircle2 size={28} strokeWidth={1.5} className="text-navy-700" />
                  </div>
                  <p className="font-semibold text-ink">Dotazník už je odeslaný</p>
                  <p className="max-w-sm text-sm text-quiet">Děkuji za vaše odpovědi i za spolupráci.</p>
                  {googleReviewUrl && promoter && !answer?.google_review_clicked_at && (
                    <a
                      href={googleReviewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex min-h-11 items-center rounded-full bg-navy-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-navy-800"
                    >
                      Napsat recenzi na Googlu
                    </a>
                  )}
                </div>
              ) : (
                <SurveyForm
                  token={token}
                  initialScore={initialScore}
                  saveInitialScore={fromUrl !== null && fromUrl !== answer?.nps}
                  googleReviewUrl={googleReviewUrl}
                />
              )}
            </div>
          </div>

          <p className="mt-6 text-center text-sm text-quiet">
            Kryštof Sobotka · VIZEON ·{' '}
            <a href="https://vizeon.cz" className="text-navy-700 underline-offset-2 hover:underline">
              vizeon.cz
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
