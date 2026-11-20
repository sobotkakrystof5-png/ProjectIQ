'use client'

import { useMemo, useState, useTransition } from 'react'
import { Briefcase, Loader2, Send, Tag, Video } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import { sendLeadEmail } from '@/app/lead-mail-actions'
import {
  LEAD_MAIL_TEMPLATES,
  formatPrice,
  leadMailDefaults,
  meetingTail,
  type LeadMailTemplateId,
} from '@/lib/admin/lead-mail-templates'
import { getPragueTodayISO, isoToPragueDateAndTime, pragueDateTimeToISO } from '@/lib/prague-time'
import { cn } from '@/lib/utils'

/**
 * „Poslat e-mail" kontaktu (R-132). Nejdřív se vybere jedna ze tří
 * šablon, text se načte a jde přepsat, potom se klikne na Odeslat. Co
 * uvidíte v okně, to odejde — žádný další krok.
 *
 * Adresát je e-mail uloženého kontaktu (server ho čte z databáze podle `kind`
 * a `id`). Okno je v Hovorech, na kartě kontaktu a u firem od AI asistenta.
 * Schůzka navíc vytvoří odkaz na Google Meet a zapíše termín do Hovorů
 * a kalendáře.
 */

export type LeadEmailReadiness = { google: boolean; mail: boolean }

/** Komu se píše. Jen údaje, které okno ukazuje; adresu si server načte sám. */
export type LeadEmailTarget = {
  kind: 'lead' | 'contact' | 'outreach'
  id: string
  company: string
  email: string
  /** Příští akce kontaktu z Hovorů — z ní je výchozí termín schůzky a text portfolia. */
  nextActionDate?: string | Date | null
  nextActionTime?: string | null
  /** Odhadovaná hodnota z Hovorů; výchozí cena v Nabídce. */
  estimatedValue?: number | string | null
}

const TEMPLATE_ICON: Record<LeadMailTemplateId, React.ReactNode> = {
  portfolio: <Briefcase size={18} strokeWidth={1.5} aria-hidden="true" />,
  nabidka: <Tag size={18} strokeWidth={1.5} aria-hidden="true" />,
  schuzka: <Video size={18} strokeWidth={1.5} aria-hidden="true" />,
}

const fieldClass =
  'w-full rounded-box border border-input bg-surface px-3.5 py-2.5 text-[15px] text-ink placeholder:text-quiet focus-visible:border-navy-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30'

/** Termín schůzky: příští akce kontaktu, je-li v budoucnu; jinak zítra v 10:00. */
function initialSlot(target: LeadEmailTarget): { date: string; time: string } {
  const planned = pragueDateTimeToISO(target.nextActionDate, target.nextActionTime?.slice(0, 5))
  if (planned && Date.parse(planned) > Date.now()) {
    const { date, time } = isoToPragueDateAndTime(planned)
    return { date, time: time.slice(0, 5) }
  }
  const tomorrow = new Date(Date.parse(`${getPragueTodayISO()}T12:00:00Z`) + 86_400_000)
  return { date: tomorrow.toISOString().slice(0, 10), time: '10:00' }
}

export function LeadEmailDialog({
  target,
  readiness,
  onClose,
}: {
  target: LeadEmailTarget
  readiness: LeadEmailReadiness
  onClose: () => void
}) {
  const [pending, start] = useTransition()
  const [template, setTemplate] = useState<LeadMailTemplateId | null>(null)
  const first = useMemo(() => initialSlot(target), [target])
  const [date, setDate] = useState(first.date)
  const [time, setTime] = useState(first.time)
  const [minutes, setMinutes] = useState(30)
  const [subjectEdited, setSubjectEdited] = useState<string | null>(null)
  const [bodyEdited, setBodyEdited] = useState<string | null>(null)
  // Cena se u každé zakázky říká jinak; výchozí je odhadovaná hodnota kontaktu.
  const [price, setPrice] = useState(formatPrice(target.estimatedValue))

  const startsAt = pragueDateTimeToISO(date, time)
  const defaults = useMemo(
    () =>
      template
        ? leadMailDefaults(template, {
            todayISO: getPragueTodayISO(),
            nextCallDate: target.nextActionDate ?? null,
            startsAt,
            price,
          })
        : null,
    [template, target.nextActionDate, startsAt, price],
  )
  const subject = subjectEdited ?? defaults?.subject ?? ''
  const body = bodyEdited ?? defaults?.body ?? ''

  const meeting = template === 'schuzka'
  const offer = template === 'nabidka'
  const blocker = meeting
    ? !readiness.google
      ? 'google'
      : !readiness.mail
        ? 'mail'
        : null
    : null
  const tail = meeting && startsAt ? meetingTail(startsAt, minutes) : null
  const canSend =
    template !== null &&
    blocker === null &&
    subject.trim() !== '' &&
    body.trim() !== '' &&
    (!offer || price.trim() !== '') &&
    (!meeting || startsAt !== null)

  const choose = (id: LeadMailTemplateId) => {
    setTemplate(id)
    // Nová šablona znamená nový text; ruční úpravy té předchozí se zahodí.
    setSubjectEdited(null)
    setBodyEdited(null)
  }

  const submit = () => {
    if (!template || !canSend) return
    start(async () => {
      const result = await sendLeadEmail({
        template,
        target: { kind: target.kind, id: target.id },
        subject,
        body,
        ...(meeting ? { date, time, minutes } : {}),
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(result.message)
      onClose()
    })
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !pending) onClose() }}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Poslat e-mail: {target.company}</DialogTitle>
          <DialogDescription>
            Komu: <span className="font-medium text-ink">{target.email}</span>
          </DialogDescription>
        </DialogHeader>

        <div role="radiogroup" aria-label="Šablona e-mailu" className="grid gap-2 sm:grid-cols-3">
          {LEAD_MAIL_TEMPLATES.map((item) => {
            const selected = template === item.id
            return (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={pending}
                onClick={() => choose(item.id)}
                className={cn(
                  'flex min-h-11 flex-col items-start gap-1 rounded-box border px-3 py-3 text-left transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-700 focus-visible:ring-offset-1',
                  selected
                    ? 'border-navy-700 bg-navy-50 text-navy-800 ring-1 ring-navy-700'
                    : 'border-navy-100 bg-surface text-ink hover:bg-navy-50/60',
                )}
              >
                <span className="flex items-center gap-2 text-sm font-semibold">
                  {TEMPLATE_ICON[item.id]}
                  {item.label}
                </span>
                <span className="text-xs leading-snug text-quiet">{item.hint}</span>
              </button>
            )
          })}
        </div>

        {template === null ? (
          <p className="text-sm text-quiet">Vyberte šablonu. Text se načte a před odesláním ho můžete přepsat.</p>
        ) : (
          <>
            {meeting && (
              <>
                <div className="grid gap-4 sm:grid-cols-3">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-sm font-medium text-ink">Den</span>
                    <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-sm font-medium text-ink">Čas</span>
                    <Input type="time" step={300} value={time} onChange={(e) => setTime(e.target.value)} required />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-sm font-medium text-ink">Délka</span>
                    <select
                      value={minutes}
                      onChange={(e) => setMinutes(Number(e.target.value))}
                      className="h-11 w-full rounded-chip border border-input bg-surface px-3.5 text-[15px] text-ink focus-visible:border-navy-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                    >
                      {[15, 30, 45, 60, 90].map((m) => (
                        <option key={m} value={m}>
                          {m} minut
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {blocker === 'google' && (
                  <p className="rounded-chip border border-navy-100 bg-navy-50/60 px-3 py-2 text-sm text-ink">
                    Odkaz na Google Meet vzniká ve vašem Google Kalendáři. Nejdřív ho{' '}
                    <a href="/dashboard/profil#google" className="font-semibold text-navy-700 underline">
                      propojte v Profilu
                    </a>
                    .
                  </p>
                )}
                {blocker === 'mail' && (
                  <p className="rounded-chip border border-navy-100 bg-navy-50/60 px-3 py-2 text-sm text-ink">
                    Odesílání z vizeon.cz ještě není nastavené, schůzku proto odsud poslat nejde.
                  </p>
                )}
              </>
            )}

            {offer && (
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-ink">Cena za tuhle zakázku</span>
                <Input
                  value={price}
                  maxLength={60}
                  placeholder="např. 12 000 Kč nebo 10 000 až 15 000 Kč"
                  onChange={(e) => setPrice(e.target.value)}
                />
                <span className="text-xs text-quiet">
                  {price.trim() === '' ? 'Bez ceny nabídku odeslat nejde. ' : ''}
                  Cena se vloží do textu; po ručním přepsání textu ji měňte přímo v něm.
                </span>
              </label>
            )}
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink">Předmět</span>
              <Input value={subject} maxLength={200} onChange={(e) => setSubjectEdited(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink">Text e-mailu</span>
              <textarea
                value={body}
                onChange={(e) => setBodyEdited(e.target.value)}
                rows={meeting ? 6 : 14}
                maxLength={4000}
                className={cn(fieldClass, 'resize-y leading-relaxed')}
              />
            </label>

            {meeting && (
              <div className="rounded-chip border border-navy-100 bg-navy-50/60 px-4 py-3">
                <p className="mb-1.5 text-xs font-medium text-quiet">Pod text doplníme sami</p>
                <p className="whitespace-pre-line text-sm leading-relaxed text-ink">
                  {tail ?? 'Vyplňte den a čas schůzky.'}
                </p>
              </div>
            )}
            {meeting && (
              <p className="text-xs text-quiet">
                Po odeslání se příští akce tohoto kontaktu v Hovorech změní na schůzku (nemá-li tam řádek, založí se) a zapíše se
                do kalendáře i do vašeho Google Kalendáře.
              </p>
            )}
          </>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Zrušit
          </Button>
          <Button type="button" onClick={submit} disabled={pending || !canSend}>
            {pending ? (
              <>
                <Loader2 size={14} strokeWidth={1.5} className="animate-spin" aria-hidden="true" />
                {meeting ? 'Vytvářím schůzku…' : 'Odesílám…'}
              </>
            ) : (
              <>
                <Send size={14} strokeWidth={1.5} aria-hidden="true" />
                Odeslat
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
