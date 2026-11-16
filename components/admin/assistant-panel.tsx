'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { AlertCircle, ArrowUpRight, Check, Loader2, Mic, Sparkles, Square, Undo2 } from 'lucide-react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import {
  applySuggestion,
  proposeSuggestion,
  rejectSuggestion,
  undoSuggestion,
  type PlanView,
} from '@/app/ai-actions'
import { contextRefFromPath, onAssistantOpen } from '@/lib/admin/assistant-open'
import { TEXT_MAX } from '@/lib/ai/assistant-limits'
import type { StepView } from '@/lib/admin/suggestions'

/**
 * Asistent (AD14, od R-111 koná sám).
 *
 * Řeknete nebo napíšete, co se má stát. Vratné věci (kontakt, termín,
 * poznámka, platba, náklad…) se provedou hned a toast nabídne „Zpět";
 * vystavení faktury, storno a zprávy klientovi čekají na klepnutí. Panel
 * vždycky ukazuje, co přesně se stalo, a u každého kroku jde „Vrátit".
 *
 * Kontext si bere z adresy: na detailu zakázky „vidí" tu zakázku. Tam ale
 * nic neprovede samo — kontext nese i text od klientů (R-069).
 */

type VoiceState = 'idle' | 'recording' | 'transcribing'

const MAX_RECORDING_SECONDS = 90
const PREFERRED_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined
  return PREFERRED_TYPES.find((type) => MediaRecorder.isTypeSupported(type))
}

function isExternal(href: string): boolean {
  return href.startsWith('mailto:') || href.startsWith('sms:') || href.startsWith('http')
}

function StepLink({ href, label }: { href: string; label: string }) {
  const cls = 'inline-flex min-h-11 items-center gap-1 text-sm text-ink underline-offset-4 hover:underline'
  if (isExternal(href)) {
    return (
      <a href={href} className={cls} target={href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer">
        {label}
        <ArrowUpRight size={14} strokeWidth={1.5} aria-hidden="true" />
      </a>
    )
  }
  return (
    <Link href={href} className={cls}>
      {label}
      <ArrowUpRight size={14} strokeWidth={1.5} aria-hidden="true" />
    </Link>
  )
}

export function AssistantPanel() {
  const router = useRouter()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [plan, setPlan] = useState<PlanView | null>(null)
  const [steps, setSteps] = useState<StepView[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [busy, setBusy] = useState<string | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const [voice, setVoice] = useState<VoiceState>('idle')
  const [seconds, setSeconds] = useState(0)
  const [canRecord, setCanRecord] = useState(false)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(
    () =>
      onAssistantOpen(({ text: prefill }) => {
        setPlan(null)
        setSteps([])
        setError(null)
        setText(prefill.slice(0, TEXT_MAX))
        setOpen(true)
      }),
    [],
  )

  // Podporu mikrofonu jde zjistit až v prohlížeči.
  useEffect(() => {
    setCanRecord(typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia) && Boolean(pickMimeType()))
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      recorderRef.current?.stream.getTracks().forEach((t) => t.stop())
    }
  }, [])

  useEffect(() => {
    if (open && voice === 'idle') setTimeout(() => inputRef.current?.focus(), 80)
  }, [open, voice])

  const ask = useCallback(
    (sentence: string, source: 'panel' | 'voice') => {
      const trimmed = sentence.trim()
      if (!trimmed || pending) return
      setError(null)
      setPlan(null)
      setSteps([])
      startTransition(async () => {
        const result = await proposeSuggestion({ text: trimmed, contextRef: contextRefFromPath(pathname), source })
        if (!result.ok) {
          setError(result.error)
          return
        }
        setPlan(result)
        setSteps(result.steps)
        const done = result.steps.filter((s) => s.ok)
        if (done.length > 0) {
          const id = result.id
          toast.success(done.length === 1 ? done[0].message : `Hotovo: ${done.length} kroky`, {
            description: done.length === 1 ? (done[0].description ?? undefined) : result.reply,
            undo:
              id && done.some((s) => s.canUndo)
                ? () => {
                    void undoSuggestion(id).then((r) => {
                      if (r.ok) {
                        setSteps(r.steps)
                        toast.success('Vráceno')
                      } else toast.error(r.error)
                      router.refresh()
                    })
                  }
                : undefined,
          })
          setText('')
          router.refresh()
        }
      })
    },
    [pending, pathname, router],
  )

  // ── Hlas ──────────────────────────────────────────────────────────────
  function stopTimer() {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
  }

  async function transcribe(audio: Blob) {
    setVoice('transcribing')
    try {
      const form = new FormData()
      form.append('audio', audio, 'nahravka')
      const res = await fetch('/api/ai-assistant/prepis', { method: 'POST', body: form })
      const data = (await res.json().catch(() => null)) as { ok?: boolean; text?: string; error?: string } | null
      if (res.ok && data?.ok && data.text) {
        const heard = data.text.slice(0, TEXT_MAX)
        setText(heard)
        setVoice('idle')
        // Diktování je celá věta — rovnou se zpracuje. Přepis je vidět
        // v okénku, takže je jasné, z čeho asistent vycházel.
        ask(heard, 'voice')
        return
      }
      setError(data?.error ?? 'Nahrávku se nepodařilo přepsat. Napište to prosím.')
    } catch {
      setError('Nahrávku se nepodařilo odeslat. Zkontrolujte připojení, nebo to napište.')
    }
    setVoice('idle')
  }

  async function startRecording() {
    setError(null)
    const mimeType = pickMimeType()
    if (!mimeType) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream, { mimeType })
      chunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        stopTimer()
        void transcribe(new Blob(chunksRef.current, { type: recorder.mimeType || mimeType }))
      }
      recorderRef.current = recorder
      recorder.start()
      setVoice('recording')
      setSeconds(0)
      timerRef.current = setInterval(() => {
        setSeconds((s) => {
          if (s + 1 >= MAX_RECORDING_SECONDS && recorder.state === 'recording') recorder.stop()
          return s + 1
        })
      }, 1000)
    } catch {
      setError('Mikrofon se nepodařilo zapnout. Povolte ho v prohlížeči, nebo to napište.')
      setVoice('idle')
    }
  }

  function stopRecording() {
    const recorder = recorderRef.current
    if (recorder && recorder.state === 'recording') recorder.stop()
  }

  // ── Kroky ─────────────────────────────────────────────────────────────
  async function runPending(index?: number) {
    if (!plan?.id || busy) return
    setBusy(index === undefined ? 'all' : `run-${index}`)
    try {
      const result = await applySuggestion(plan.id, index)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setError(null)
      setSteps(result.steps)
      const fresh = result.steps.filter((s) => index === undefined || s.index === index)
      const failed = fresh.find((s) => !s.ok)
      if (failed) toast.error(failed.error ?? 'Něco se nepovedlo.')
      else toast.success(index === undefined ? 'Hotovo' : (fresh[0]?.message ?? 'Hotovo'))
      // Připravená zpráva otevírá poštovního klienta nebo telefon.
      const message = fresh.find((s) => s.ok && s.href?.startsWith('mailto:')) ?? fresh.find((s) => s.ok && s.href?.startsWith('sms:'))
      if (message?.href) window.location.href = message.href
      router.refresh()
    } finally {
      setBusy(null)
    }
  }

  async function undo(index: number) {
    if (!plan?.id || busy) return
    setBusy(`undo-${index}`)
    try {
      const result = await undoSuggestion(plan.id, index)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setSteps(result.steps)
      toast.success('Vráceno')
      router.refresh()
    } finally {
      setBusy(null)
    }
  }

  function dismiss() {
    if (plan?.id && steps.length === 0) void rejectSuggestion(plan.id)
    setPlan(null)
    setSteps([])
    setError(null)
    inputRef.current?.focus()
  }

  const stepFor = (index: number) => steps.find((s) => s.index === index)
  const waiting = plan ? plan.actions.filter((a) => !stepFor(a.index)?.ok) : []
  const canRun = Boolean(plan?.id) && !plan?.cannotRun

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Otevřít asistenta"
        title="Asistent"
        className="fixed bottom-20 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-navy-700 text-white shadow-lg transition-transform hover:bg-navy-800 active:scale-95 lg:bottom-6 lg:right-6"
      >
        <Sparkles size={22} strokeWidth={1.5} aria-hidden="true" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="font-ws sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Sparkles size={18} strokeWidth={1.5} aria-hidden="true" />
              Asistent
            </SheetTitle>
            <SheetDescription>
              Řekněte nebo napište, co se má stát. Zapíšu to hned a půjde to vrátit. Fakturu a zprávy klientům pošlu až
              po vašem klepnutí.
            </SheetDescription>
          </SheetHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
            <div>
              <label htmlFor="asistent-veta" className="sr-only">
                Co se má stát
              </label>
              <textarea
                id="asistent-veta"
                ref={inputRef}
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, TEXT_MAX))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    ask(text, 'panel')
                  }
                }}
                rows={3}
                maxLength={TEXT_MAX}
                disabled={voice !== 'idle'}
                placeholder="Například: přidej Pavla Nováka, ve čtvrtek ve dvě s ním mám schůzku k webu"
                className="w-full rounded-chip border border-navy-100 bg-background px-3.5 py-2.5 text-sm text-ink outline-none placeholder:text-quiet focus:ring-2 focus:ring-ring"
              />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button type="button" onClick={() => ask(text, 'panel')} disabled={pending || voice !== 'idle' || !text.trim()}>
                  {pending ? (
                    <>
                      <Loader2 size={14} strokeWidth={1.5} className="animate-spin" aria-hidden="true" />
                      Pracuju na tom…
                    </>
                  ) : (
                    'Udělat'
                  )}
                </Button>
                {canRecord && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={voice === 'recording' ? stopRecording : startRecording}
                    disabled={pending || voice === 'transcribing'}
                    aria-pressed={voice === 'recording'}
                  >
                    {voice === 'recording' ? (
                      <>
                        <Square size={14} strokeWidth={1.5} aria-hidden="true" />
                        Hotovo ({seconds} s)
                      </>
                    ) : voice === 'transcribing' ? (
                      <>
                        <Loader2 size={14} strokeWidth={1.5} className="animate-spin" aria-hidden="true" />
                        Přepisuju…
                      </>
                    ) : (
                      <>
                        <Mic size={14} strokeWidth={1.5} aria-hidden="true" />
                        Nadiktovat
                      </>
                    )}
                  </Button>
                )}
                <span className="text-xs text-quiet">Enter odešle</span>
              </div>
            </div>

            {error && (
              <p role="alert" className="rounded-chip bg-danger/10 px-3 py-2 text-sm text-ink">
                {error}
              </p>
            )}

            {plan && (
              <div className="space-y-3" aria-live="polite">
                {plan.reply && <p className="text-sm text-ink">{plan.reply}</p>}

                {plan.cannotRun && (
                  <p className="rounded-chip bg-signal/15 px-3 py-2 text-sm text-ink">
                    Plán se nepodařilo uložit, takže ho nejde provést. Zapište to prosím ručně.
                  </p>
                )}
                {plan.guarded && !plan.cannotRun && waiting.length > 0 && (
                  <p className="rounded-chip bg-signal/15 px-3 py-2 text-sm text-ink">
                    Na téhle obrazovce můžou být texty od klientů, proto jsem nic neprovedl sám. Projděte si to a
                    klepněte.
                  </p>
                )}
                {plan.unsure && !plan.guarded && !plan.cannotRun && waiting.length > 0 && (
                  <p className="rounded-chip bg-signal/15 px-3 py-2 text-sm text-ink">
                    Nejsem si jistý, jestli jsem to pochopil správně. Nic jsem neprovedl — projděte si to.
                  </p>
                )}

                {plan.actions.map((action) => {
                  const step = stepFor(action.index)
                  const done = step?.ok === true
                  return (
                    <div key={action.index} className="rounded-panel border border-navy-100 bg-surface p-4">
                      <div className="flex items-start justify-between gap-3">
                        <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                          {done && !step?.undone && <Check size={16} strokeWidth={2} aria-hidden="true" />}
                          {step && !step.ok && <AlertCircle size={16} strokeWidth={1.5} className="text-danger" aria-hidden="true" />}
                          {done ? step.message : action.title}
                          {step?.undone && <span className="font-normal text-quiet">(vráceno)</span>}
                        </p>
                        {!done && action.cls === 'confirm' && (
                          <span className="shrink-0 rounded-chip bg-signal/15 px-2 py-0.5 text-xs text-ink">Čeká na vás</span>
                        )}
                      </div>

                      {done && step.description ? (
                        <p className="mt-1 text-sm text-ink">{step.description}</p>
                      ) : (
                        <dl className="mt-3 space-y-1.5">
                          {action.lines.map((line) => (
                            <div key={line.label} className="flex gap-3 text-sm">
                              <dt className="w-24 shrink-0 text-quiet">{line.label}</dt>
                              <dd className="min-w-0 flex-1 whitespace-pre-wrap text-ink">{line.value}</dd>
                            </div>
                          ))}
                        </dl>
                      )}

                      {step?.error && <p className="mt-2 text-sm text-danger">{step.error}</p>}

                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                        {!done && canRun && (
                          <Button type="button" onClick={() => void runPending(action.index)} disabled={busy !== null}>
                            {busy === `run-${action.index}` ? 'Provádím…' : step && !step.ok ? 'Zkusit znovu' : 'Provést'}
                          </Button>
                        )}
                        {step?.href && <StepLink href={step.href} label={done ? 'Otevřít' : 'Doplnit ve formuláři'} />}
                        {step?.canUndo && (
                          <Button type="button" variant="ghost" onClick={() => void undo(action.index)} disabled={busy !== null}>
                            <Undo2 size={14} strokeWidth={1.5} aria-hidden="true" />
                            {busy === `undo-${action.index}` ? 'Vracím…' : 'Vrátit'}
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })}

                {(plan.assumptions.length > 0 || plan.missing.length > 0) && (
                  <div className="space-y-2 text-sm">
                    {plan.assumptions.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-quiet">Domyslel jsem si</p>
                        <ul className="mt-1 space-y-1 text-ink">
                          {plan.assumptions.map((item) => (
                            <li key={item}>• {item}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {plan.missing.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-quiet">Chybí doplnit</p>
                        <ul className="mt-1 space-y-1 text-ink">
                          {plan.missing.map((item) => (
                            <li key={item}>• {item}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  {canRun && waiting.length > 1 && (
                    <Button type="button" onClick={() => void runPending()} disabled={busy !== null}>
                      {busy === 'all' ? 'Provádím…' : `Provést vše (${waiting.length})`}
                    </Button>
                  )}
                  <Button type="button" variant="ghost" onClick={dismiss}>
                    {steps.some((s) => s.ok) ? 'Nová věta' : 'Zahodit'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
