'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ExternalLink, Loader2, Pencil, Send, Sparkles } from 'lucide-react'
import { toast } from '@/components/ui/toast'
import { sendLeadEmail } from '@/app/lead-mail-actions'
import { demoStatusAction, requestDemoAction } from '@/app/offer-proposal-actions'
import { buildProposalMail, formatPrice } from '@/lib/admin/lead-mail-templates'
import type { DemoView } from '@/lib/admin/offers/demo'
import { cn } from '@/lib/utils'

/**
 * Co poslat klientovi (R-160): cenovou nabídku, ukázku webu, nebo obojí.
 *
 * Ukázku staví Growth OS. Když ji firma od robota už má, je hotová hned.
 * Jinak „Vyžádat ukázku" a karta se každých 30 s zeptá, jestli je hotová;
 * hotovou ukázku ohlásí i zvonek. E-mail je předepsaný, jde upravit
 * a odejde jedním kliknutím z krystof@vizeon.cz. Adresu čte server z kontaktu.
 */

const quietBtn =
  'inline-flex min-h-11 items-center gap-1.5 rounded-full border border-navy-200 px-4 text-sm font-medium text-ink transition-colors hover:bg-navy-50 disabled:opacity-60'
const primaryBtn =
  'inline-flex min-h-11 items-center gap-2 rounded-full bg-navy-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-navy-800 disabled:opacity-60'
const fieldClass =
  'w-full rounded-chip border border-navy-200 bg-surface px-3 py-2 text-sm text-ink focus:border-navy-700 focus:outline-none'

const POLL_MS = 30_000

const timeText = (iso: string) =>
  new Intl.DateTimeFormat('cs-CZ', { hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'numeric', timeZone: 'Europe/Prague' }).format(
    new Date(iso),
  )

export type SendPanelProps = {
  proposalId: string
  contactId: string
  company: string
  email: string | null
  mailReady: boolean
  offerUrl: string
  /** Doporučená cena teď (u konceptu z editoru). */
  recommendedPrice: number
  /** Nabídka už jednou odešla: odkaz funguje, poslat ho znovu jde. */
  offerSent: boolean
  demo: DemoView
  /** Před odesláním (koncept: uložit změny, potvrzení ceny nad stropem). `false` = neposílat. */
  beforeSend?: () => Promise<boolean>
}

export function SendPanel(props: SendPanelProps) {
  const router = useRouter()
  const [view, setView] = useState<DemoView>(props.demo)
  useEffect(() => setView(props.demo), [props.demo])
  const demo = view.demo
  const demoReady = demo?.status === 'ready' && demo.url !== null

  const [includeOffer, setIncludeOffer] = useState(!props.offerSent)
  // Hotová a ještě neposlaná ukázka, nebo ta, která se právě staví, je předvybraná.
  const [includeDemo, setIncludeDemo] = useState((demoReady && !demo?.sentAt) || demo?.status === 'requested')
  const [editing, setEditing] = useState(false)
  const [pending, startTransition] = useTransition()

  const generated = useMemo(
    () =>
      buildProposalMail({
        company: props.company,
        offerUrl: includeOffer ? props.offerUrl : null,
        price: includeOffer ? formatPrice(props.recommendedPrice) : null,
        demoUrl: includeDemo && demoReady ? demo!.url : null,
      }),
    [props.company, props.offerUrl, props.recommendedPrice, includeOffer, includeDemo, demoReady, demo],
  )
  const [subject, setSubject] = useState(generated.subject)
  const [body, setBody] = useState(generated.body)
  // Změna výběru napíše text znovu. Ruční úprava platí jen pro tenhle výběr.
  useEffect(() => {
    setSubject(generated.subject)
    setBody(generated.body)
    setEditing(false)
  }, [generated])

  // Čeká se na Growth OS: stav se dotahuje, dokud ukázka není hotová nebo nespadla.
  useEffect(() => {
    if (demo?.status !== 'requested') return
    const timer = setInterval(() => {
      void demoStatusAction(props.proposalId).then((next) => {
        if (next) setView(next)
      })
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [demo?.status, props.proposalId])

  const requestDemo = () =>
    startTransition(async () => {
      const res = await requestDemoAction(props.proposalId)
      if (!res.ok) {
        toast.error('Ukázku se nepodařilo vyžádat', { description: res.error })
        return
      }
      setView(res.view)
      setIncludeDemo(true)
      toast.success('Ukázka se staví', { description: 'Obvykle do 20 minut. Až bude hotová, ozve se zvonek.' })
    })

  const nothing = !includeOffer && !includeDemo
  const waitingForDemo = includeDemo && !demoReady

  const send = () =>
    startTransition(async () => {
      if (props.beforeSend && !(await props.beforeSend())) return
      const res = await sendLeadEmail(
        includeDemo
          ? {
              template: 'ukazka',
              target: { kind: 'contact', id: props.contactId },
              subject,
              body,
              proposalId: props.proposalId,
              includeOffer,
            }
          : {
              template: 'nabidka',
              target: { kind: 'contact', id: props.contactId },
              subject,
              body,
              offerId: props.proposalId,
            },
      )
      if (!res.ok) {
        toast.error('E-mail neodešel', { description: res.error })
        return
      }
      toast.success(res.message, { description: props.email ? `Na ${props.email}` : undefined })
      router.refresh()
    })

  return (
    <div className="flex flex-col gap-4 rounded-chip border border-navy-100 px-4 py-4">
      <div className="flex flex-col gap-1">
        <h4 className="text-sm font-semibold text-ink">Co poslat klientovi</h4>
        <p className="text-xs text-quiet">Vyberte jedno, nebo obojí. E-mail se napíše sám, upravit ho můžete před odesláním.</p>
      </div>

      <div className="flex flex-col gap-1">
        <label className="flex min-h-11 items-start gap-2.5 text-sm text-ink">
          <input
            type="checkbox"
            checked={includeOffer}
            onChange={(e) => setIncludeOffer(e.target.checked)}
            className="mt-0.5 h-5 w-5"
          />
          <span>
            Cenová nabídka
            <span className="block text-xs text-quiet">
              {props.offerSent ? 'Už odešla, odkaz můžete poslat znovu.' : 'Tři varianty, klient si jednu vybere na stránce nabídky.'}
            </span>
          </span>
        </label>

        <label className={cn('flex min-h-11 items-start gap-2.5 text-sm text-ink', !demoReady && !view.canRequest && !demo && 'opacity-70')}>
          <input
            type="checkbox"
            checked={includeDemo}
            disabled={!demo && !view.canRequest}
            onChange={(e) => setIncludeDemo(e.target.checked)}
            className="mt-0.5 h-5 w-5"
          />
          <span>
            Ukázka webu
            <span className="block text-xs text-quiet">
              <DemoLine demo={demo} canRequest={view.canRequest} />
            </span>
          </span>
        </label>
        {demoReady && (
          <a href={demo!.url!} target="_blank" rel="noopener noreferrer" className="ml-8 inline-flex min-h-11 w-fit items-center gap-1.5 text-sm text-navy-700 underline underline-offset-2">
            <ExternalLink size={14} strokeWidth={1.75} aria-hidden />
            Otevřít ukázku
          </a>
        )}
      </div>

      {!nothing && !waitingForDemo && (
        <div className="flex flex-col gap-2">
          {editing ? (
            <>
              <label className="flex flex-col gap-1 text-xs text-quiet">
                Předmět
                <input value={subject} onChange={(e) => setSubject(e.target.value)} className={cn(fieldClass, 'min-h-11')} />
              </label>
              <label className="flex flex-col gap-1 text-xs text-quiet">
                Text e-mailu
                <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={10} className={fieldClass} />
              </label>
            </>
          ) : (
            <div className="rounded-chip bg-navy-50 px-3 py-3">
              <p className="text-xs text-quiet">
                Předmět: <span className="text-ink">{subject}</span>
              </p>
              <p className="mt-2 whitespace-pre-line break-words text-sm text-ink">{body}</p>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {waitingForDemo && !demo ? (
          <button type="button" onClick={requestDemo} disabled={pending || !view.canRequest} className={primaryBtn}>
            {pending ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Sparkles size={16} strokeWidth={1.75} aria-hidden />}
            Vyžádat ukázku
          </button>
        ) : waitingForDemo && demo?.status === 'failed' ? (
          <button type="button" onClick={requestDemo} disabled={pending || !view.canRequest} className={primaryBtn}>
            {pending ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Sparkles size={16} strokeWidth={1.75} aria-hidden />}
            Vyžádat ukázku znovu
          </button>
        ) : waitingForDemo ? (
          <p className="inline-flex min-h-11 items-center gap-2 text-sm text-quiet">
            <Loader2 size={16} className="animate-spin" aria-hidden />
            Čekám na ukázku. E-mail se připraví, až bude hotová.
          </p>
        ) : props.email && props.mailReady ? (
          <button type="button" onClick={send} disabled={pending || nothing} className={primaryBtn}>
            {pending ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Send size={16} strokeWidth={1.75} aria-hidden />}
            {nothing ? 'Vyberte, co poslat' : 'Odeslat e-mail'}
          </button>
        ) : (
          <p className="text-sm text-quiet">
            {props.email ? 'Odesílání e-mailů není nastavené.' : 'Kontakt nemá e-mail. Doplňte ho na kartě kontaktu.'}
          </p>
        )}
        {!nothing && !waitingForDemo && (
          <button type="button" onClick={() => setEditing((v) => !v)} className={quietBtn}>
            <Pencil size={15} strokeWidth={1.75} aria-hidden />
            {editing ? 'Hotovo' : 'Upravit text'}
          </button>
        )}
      </div>
    </div>
  )
}

function DemoLine({ demo, canRequest }: { demo: DemoView['demo']; canRequest: boolean }) {
  if (!demo) {
    return canRequest
      ? 'Zatím ji nemáme. Postaví ji Growth OS, obvykle do 20 minut.'
      : 'Ukázky zatím nejde vyžádat, ZakazIQ ještě není napojený na Growth OS.'
  }
  if (demo.status === 'ready') {
    const from = demo.source === 'robot' ? 'Hotová z hovoru s robotem.' : 'Hotová.'
    return demo.sentAt ? `${from} Odeslaná ${timeText(demo.sentAt)}.` : from
  }
  if (demo.status === 'requested') return `Staví se${demo.requestedAt ? ` od ${timeText(demo.requestedAt)}` : ''}. Až bude hotová, ozve se zvonek.`
  return demo.error === 'timeout' ? 'Stavba trvala moc dlouho. Vyžádejte ji znovu.' : 'Ukázka se nepostavila. Vyžádejte ji znovu.'
}
