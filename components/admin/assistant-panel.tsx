'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { AlertCircle, ArrowUpRight, Check, Loader2, Mic, Plus, Sparkles, Square, Undo2 } from 'lucide-react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import { applySuggestion, proposeSuggestion, undoSuggestion, type PlanView } from '@/app/ai-actions'
import { contextRefFromPath, onAssistantOpen } from '@/lib/admin/assistant-open'
import { HISTORY_MAX, TEXT_MAX } from '@/lib/ai/assistant-limits'
import type { StepView } from '@/lib/admin/suggestions'

/**
 * Asistent jako chat (AD14 → R-111 koná sám → R-113 rozhovor).
 *
 * Každý chat je nová session: začne prázdný, ale server ke každé větě
 * přidá přehled firmy (zakázky, kontakty, termíny, paměť), takže asistent
 * ví, o čem se mluví. Uvnitř chatu si pamatuje předchozí repliky — když se
 * zeptá na čas nebo telefon, stačí odpovědět „ve tři, 777 123 456".
 * Nový chat začne tlačítkem, nebo sám po 15 minutách bez práce.
 *
 * Vratné věci se provedou hned a toast nabídne „Zpět"; vystavení faktury,
 * storno a zprávy klientovi čekají na klepnutí. Na detailu zakázky nic
 * neprovede samo — kontext nese i text od klientů (R-069).
 */

type VoiceState = 'idle' | 'recording' | 'transcribing'

type ChatMessage =
  | { key: string; role: 'user'; text: string }
  | { key: string; role: 'assistant'; plan: PlanView; steps: StepView[]; turn: string }
  | { key: string; role: 'error'; text: string }

/** Po téhle pauze začne otevření panelu nový chat. */
const SESSION_IDLE_MS = 15 * 60 * 1000
const MAX_RECORDING_SECONDS = 90
const PREFERRED_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']

const EXAMPLES = [
  'Zapiš schůzku s Pavlem Novákem ve čtvrtek ve 14:00',
  'Kolik mi kdo dluží?',
  'Zapamatuj si, že web na míru stojí od 25 000 Kč',
]

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined
  return PREFERRED_TYPES.find((type) => MediaRecorder.isTypeSupported(type))
}

function isExternal(href: string): boolean {
  return href.startsWith('mailto:') || href.startsWith('sms:') || href.startsWith('http')
}

let keySeq = 0
const nextKey = () => `m${Date.now()}-${keySeq++}`

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

function PlanCard({
  plan,
  steps,
  busy,
  onRun,
  onUndo,
}: {
  plan: PlanView
  steps: StepView[]
  busy: string | null
  onRun: (index?: number) => void
  onUndo: (index: number) => void
}) {
  const stepFor = (index: number) => steps.find((s) => s.index === index)
  const waiting = plan.actions.filter((a) => !stepFor(a.index)?.ok)
  const canRun = Boolean(plan.id) && !plan.cannotRun
  const busyKey = (suffix: string) => `${plan.id}:${suffix}`

  return (
    <div className="space-y-3">
      {plan.reply && <p className="whitespace-pre-wrap text-sm text-ink">{plan.reply}</p>}

      {plan.cannotRun && (
        <p className="rounded-chip bg-signal/15 px-3 py-2 text-sm text-ink">
          Plán se nepodařilo uložit, takže ho nejde provést. Zapište to prosím ručně.
        </p>
      )}
      {plan.guarded && !plan.cannotRun && waiting.length > 0 && (
        <p className="rounded-chip bg-signal/15 px-3 py-2 text-sm text-ink">
          V tomhle chatu jsou texty od klientů, proto jsem nic neprovedl sám. Projděte si to a klepněte.
        </p>
      )}
      {plan.pastTime && !plan.cannotRun && waiting.length > 0 && (
        <p className="rounded-chip bg-signal/15 px-3 py-2 text-sm text-ink">
          Ten čas už proběhl, proto jsem nic neprovedl sám. Jestli to chcete zapsat zpětně, klepněte. Jinak mi řekněte
          správný čas.
        </p>
      )}
      {plan.unsure && !plan.guarded && !plan.pastTime && !plan.cannotRun && waiting.length > 0 && (
        <p className="rounded-chip bg-signal/15 px-3 py-2 text-sm text-ink">
          Nejsem si jistý, jestli jsem to pochopil správně. Nic jsem neprovedl — projděte si to.
        </p>
      )}

      {plan.actions.map((action) => {
        const step = stepFor(action.index)
        const done = step?.ok === true
        return (
          <div
            key={action.index}
            className={`rounded-panel border border-navy-100 bg-surface p-4 ${plan.needsInfo ? 'opacity-70' : ''}`}
          >
            <div className="flex items-start justify-between gap-3">
              <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                {done && !step?.undone && <Check size={16} strokeWidth={2} aria-hidden="true" />}
                {step && !step.ok && <AlertCircle size={16} strokeWidth={1.5} className="text-danger" aria-hidden="true" />}
                {done ? step.message : action.title}
                {step?.undone && <span className="font-normal text-quiet">(vráceno)</span>}
              </p>
              {plan.needsInfo ? (
                <span className="shrink-0 rounded-chip bg-navy-50 px-2 py-0.5 text-xs text-ink">Po doplnění</span>
              ) : (
                !done &&
                action.cls === 'confirm' && (
                  <span className="shrink-0 rounded-chip bg-signal/15 px-2 py-0.5 text-xs text-ink">Čeká na vás</span>
                )
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
                <Button type="button" onClick={() => onRun(action.index)} disabled={busy !== null}>
                  {busy === busyKey(`run-${action.index}`) ? 'Provádím…' : step && !step.ok ? 'Zkusit znovu' : 'Provést'}
                </Button>
              )}
              {step?.href && <StepLink href={step.href} label={done ? 'Otevřít' : 'Doplnit ve formuláři'} />}
              {step?.canUndo && (
                <Button type="button" variant="ghost" onClick={() => onUndo(action.index)} disabled={busy !== null}>
                  <Undo2 size={14} strokeWidth={1.5} aria-hidden="true" />
                  {busy === busyKey(`undo-${action.index}`) ? 'Vracím…' : 'Vrátit'}
                </Button>
              )}
            </div>
          </div>
        )
      })}

      {(plan.assumptions.length > 0 || plan.missing.length > 0) && (
        <div className="space-y-2 text-sm">
          {plan.missing.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-quiet">{plan.needsInfo ? 'Potřebuju od vás' : 'Chybí doplnit'}</p>
              <ul className="mt-1 space-y-1 text-ink">
                {plan.missing.map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            </div>
          )}
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
        </div>
      )}

      {canRun && waiting.length > 1 && (
        <Button type="button" onClick={() => onRun()} disabled={busy !== null}>
          {busy === busyKey('all') ? 'Provádím…' : `Provést vše (${waiting.length})`}
        </Button>
      )}
    </div>
  )
}

export function AssistantPanel() {
  const router = useRouter()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [tainted, setTainted] = useState(false)
  const [pending, startTransition] = useTransition()
  const [busy, setBusy] = useState<string | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const messagesRef = useRef<ChatMessage[]>([])
  const lastActivityRef = useRef(0)

  const [voice, setVoice] = useState<VoiceState>('idle')
  const [seconds, setSeconds] = useState(0)
  const [canRecord, setCanRecord] = useState(false)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  const resetChat = useCallback(() => {
    setMessages([])
    messagesRef.current = []
    setTainted(false)
  }, [])

  const newChat = useCallback(() => {
    resetChat()
    setText('')
    lastActivityRef.current = Date.now()
    setTimeout(() => inputRef.current?.focus(), 80)
  }, [resetChat])

  const openPanel = useCallback(() => {
    // Každý chat je nová session; jen rozhovor z poslední čtvrthodiny
    // pokračuje (asistent se třeba zrovna na něco ptal).
    if (Date.now() - lastActivityRef.current > SESSION_IDLE_MS) resetChat()
    setOpen(true)
  }, [resetChat])

  useEffect(
    () =>
      onAssistantOpen(({ text: prefill }) => {
        // Z ⌘K přichází nová věta — začíná s ní nový chat.
        resetChat()
        setText(prefill.slice(0, TEXT_MAX))
        lastActivityRef.current = Date.now()
        setOpen(true)
      }),
    [resetChat],
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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length, pending])

  const updatePlan = useCallback((planId: string, steps: StepView[], turn: string) => {
    setMessages((list) =>
      list.map((m) => (m.role === 'assistant' && m.plan.id === planId ? { ...m, steps, turn: turn || m.turn } : m)),
    )
  }, [])

  const ask = useCallback(
    (sentence: string, source: 'panel' | 'voice') => {
      const trimmed = sentence.trim()
      if (!trimmed || pending) return
      lastActivityRef.current = Date.now()

      // Historie = předchozí repliky; asistentovu stranu tvoří shrnutí kola
      // ze serveru (co se provedlo, s id záznamů), ne jen text odpovědi.
      const history = messagesRef.current
        .flatMap((m): { role: 'user' | 'assistant'; content: string }[] =>
          m.role === 'user'
            ? [{ role: 'user', content: m.text }]
            : m.role === 'assistant'
              ? [{ role: 'assistant', content: m.turn }]
              : [],
        )
        .slice(-HISTORY_MAX)

      setMessages((list) => [...list, { key: nextKey(), role: 'user', text: trimmed }])
      setText('')

      startTransition(async () => {
        const result = await proposeSuggestion({
          text: trimmed,
          contextRef: contextRefFromPath(pathname),
          source,
          history,
          tainted,
        })
        lastActivityRef.current = Date.now()
        if (!result.ok) {
          setMessages((list) => [...list, { key: nextKey(), role: 'error', text: result.error }])
          return
        }
        if (result.tainted) setTainted(true)
        setMessages((list) => [
          ...list,
          { key: nextKey(), role: 'assistant', plan: result, steps: result.steps, turn: result.turn },
        ])
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
                        updatePlan(id, r.steps, r.turn)
                        toast.success('Vráceno')
                      } else toast.error(r.error)
                      router.refresh()
                    })
                  }
                : undefined,
          })
          router.refresh()
        }
      })
    },
    [pending, pathname, router, tainted, updatePlan],
  )

  // ── Hlas ──────────────────────────────────────────────────────────────
  function stopTimer() {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
  }

  function pushError(message: string) {
    setMessages((list) => [...list, { key: nextKey(), role: 'error', text: message }])
  }

  async function transcribe(audio: Blob) {
    setVoice('transcribing')
    try {
      const form = new FormData()
      form.append('audio', audio, 'nahravka')
      const res = await fetch('/api/ai-assistant/prepis', { method: 'POST', body: form })
      const data = (await res.json().catch(() => null)) as { ok?: boolean; text?: string; error?: string } | null
      if (res.ok && data?.ok && data.text) {
        setVoice('idle')
        // Diktování je celá věta — rovnou se zpracuje. Přepis je vidět
        // v chatu, takže je jasné, z čeho asistent vycházel.
        ask(data.text.slice(0, TEXT_MAX), 'voice')
        return
      }
      pushError(data?.error ?? 'Nahrávku se nepodařilo přepsat. Napište to prosím.')
    } catch {
      pushError('Nahrávku se nepodařilo odeslat. Zkontrolujte připojení, nebo to napište.')
    }
    setVoice('idle')
  }

  async function startRecording() {
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
      pushError('Mikrofon se nepodařilo zapnout. Povolte ho v prohlížeči, nebo to napište.')
      setVoice('idle')
    }
  }

  function stopRecording() {
    const recorder = recorderRef.current
    if (recorder && recorder.state === 'recording') recorder.stop()
  }

  // ── Kroky ─────────────────────────────────────────────────────────────
  async function runPending(planId: string | null, index?: number) {
    if (!planId || busy) return
    lastActivityRef.current = Date.now()
    setBusy(`${planId}:${index === undefined ? 'all' : `run-${index}`}`)
    try {
      const result = await applySuggestion(planId, index)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      updatePlan(planId, result.steps, result.turn)
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

  async function undo(planId: string | null, index: number) {
    if (!planId || busy) return
    lastActivityRef.current = Date.now()
    setBusy(`${planId}:undo-${index}`)
    try {
      const result = await undoSuggestion(planId, index)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      updatePlan(planId, result.steps, result.turn)
      toast.success('Vráceno')
      router.refresh()
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openPanel}
        aria-label="Otevřít asistenta"
        title="Asistent"
        className={cn(
          'fixed bottom-20 right-4 z-30 h-14 w-14 items-center justify-center rounded-full bg-navy-700 text-white shadow-lg transition-transform hover:bg-navy-800 active:scale-95 lg:bottom-6 lg:right-6',
          // Ve Zprávách je na telefonu dole pole pro psaní a tlačítko by zakrylo
          // „Poslat ke schválení" i odeslání. Asistent jde dál otevřít z hledání.
          pathname?.startsWith('/dashboard/zpravy') ? 'hidden lg:flex' : 'flex',
        )}
      >
        <Sparkles size={22} strokeWidth={1.5} aria-hidden="true" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="font-ws sm:max-w-lg">
          <SheetHeader>
            <div className="flex items-center justify-between gap-3 pr-8">
              <SheetTitle className="flex items-center gap-2">
                <Sparkles size={18} strokeWidth={1.5} aria-hidden="true" />
                Asistent
              </SheetTitle>
              {messages.length > 0 && (
                <Button type="button" variant="ghost" onClick={newChat} disabled={pending}>
                  <Plus size={14} strokeWidth={1.5} aria-hidden="true" />
                  Nový chat
                </Button>
              )}
            </div>
            <SheetDescription>
              Zapíšu, upravím a zapamatuju si, co mi řeknete. Když mi něco chybí, zeptám se dřív, než to udělám.
            </SheetDescription>
          </SheetHeader>

          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto" aria-live="polite">
            {messages.length === 0 && !pending ? (
              <div className="space-y-3 py-2">
                <p className="text-sm text-quiet">
                  Vidím rozpracované zakázky, kontakty a termíny na dva týdny dopředu. Zkuste třeba:
                </p>
                <div className="flex flex-col items-start gap-2">
                  {EXAMPLES.map((example) => (
                    <button
                      key={example}
                      type="button"
                      onClick={() => {
                        setText(example)
                        inputRef.current?.focus()
                      }}
                      className="min-h-11 rounded-chip border border-navy-100 bg-surface px-3 py-2 text-left text-sm text-ink hover:bg-navy-50"
                    >
                      {example}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4 py-2">
                {messages.map((m) =>
                  m.role === 'user' ? (
                    <div key={m.key} className="flex justify-end">
                      <p className="max-w-[85%] whitespace-pre-wrap rounded-panel bg-navy-700 px-3.5 py-2.5 text-sm text-white">
                        {m.text}
                      </p>
                    </div>
                  ) : m.role === 'error' ? (
                    <p key={m.key} role="alert" className="rounded-chip bg-danger/10 px-3 py-2 text-sm text-ink">
                      {m.text}
                    </p>
                  ) : (
                    <PlanCard
                      key={m.key}
                      plan={m.plan}
                      steps={m.steps}
                      busy={busy}
                      onRun={(index) => void runPending(m.plan.id, index)}
                      onUndo={(index) => void undo(m.plan.id, index)}
                    />
                  ),
                )}
                {pending && (
                  <p className="flex items-center gap-2 text-sm text-quiet">
                    <Loader2 size={14} strokeWidth={1.5} className="animate-spin" aria-hidden="true" />
                    Přemýšlím…
                  </p>
                )}
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="border-t border-navy-100 pt-3">
            <label htmlFor="asistent-veta" className="sr-only">
              Zpráva pro asistenta
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
              rows={2}
              maxLength={TEXT_MAX}
              disabled={voice !== 'idle'}
              placeholder={messages.length > 0 ? 'Odpovězte nebo napište další věc…' : 'Co mám udělat?'}
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
                  'Odeslat'
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
        </SheetContent>
      </Sheet>
    </>
  )
}
