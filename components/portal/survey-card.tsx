import { CheckCircle2 } from 'lucide-react'
import type { ClientSurvey } from '@/lib/portal/survey'
import { SurveyForm } from '@/components/SurveyForm'

/**
 * Hodnocení hotové zakázky v klientském prostoru (KP16) — tentýž dotazník
 * jako v e-mailu (R-119). Známka se uloží hned po výběru; po odeslání je
 * odpověď uzavřená a ukáže se jen poděkování. Jedna odpověď na zakázku,
 * i když má klient víc členů.
 */
export function SurveyCard({ survey }: { survey: ClientSurvey }) {
  if (survey.completed) {
    return (
      <section id="hodnoceni" className="mt-5 flex scroll-mt-4 items-start gap-3 rounded-box border border-navy-100 bg-surface p-5">
        <CheckCircle2 size={20} strokeWidth={1.5} className="mt-0.5 shrink-0 text-navy-700" aria-hidden="true" />
        <div>
          <h2 className="font-semibold text-ink">Děkuji za hodnocení</h2>
          <p className="mt-1 text-sm text-quiet">Vaše odpovědi mám. Moc mi pomáhají.</p>
        </div>
      </section>
    )
  }
  return (
    <section id="hodnoceni" aria-labelledby="hodnoceni-nadpis" className="mt-5 scroll-mt-4 rounded-box border border-signal-line bg-surface p-5">
      <h2 id="hodnoceni-nadpis" className="text-lg font-semibold text-ink">Jak jste byli spokojení?</h2>
      <p className="mb-4 mt-1 text-sm text-quiet">Zakázka je hotová. Zabere to minutu a povinná je jen první otázka.</p>
      <SurveyForm token={survey.token} initialScore={survey.nps} saveInitialScore={false} googleReviewUrl={survey.googleReviewUrl} />
    </section>
  )
}
