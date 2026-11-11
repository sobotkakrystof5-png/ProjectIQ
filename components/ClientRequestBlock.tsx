'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { CheckCircle2, Loader2, MessageSquarePlus, Mic, Square } from 'lucide-react'
import { submitClientRequest } from '@/app/portal-actions'
import { REQUEST_MAX_CHARS } from '@/lib/client-requests'
import { cn } from '@/lib/utils'

type SubmitResult = { success: boolean; error?: string }

interface ClientRequestBlockProps {
  /** Veřejný odkaz /p/[token]. Klientský prostor (KP07) místo něj předává `submit` a `transcribeUrl`. */
  token?: string
  submit?: (data: { text: string; source: 'text' | 'voice' }) => Promise<SubmitResult>
  transcribeUrl?: string
  /** Přepis hlasu je zapnutý jen s nastaveným klíčem u poskytovatele. */
  voiceEnabled: boolean
}

type VoiceState = 'idle' | 'recording' | 'transcribing'

const MAX_RECORDING_SECONDS = 120
const PREFERRED_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined
  return PREFERRED_TYPES.find(type => MediaRecorder.isTypeSupported(type))
}

export function ClientRequestBlock({ token, submit, transcribeUrl, voiceEnabled }: ClientRequestBlockProps) {
  const [text, setText] = useState('')
  const [fromVoice, setFromVoice] = useState(false)
  const [voice, setVoice] = useState<VoiceState>('idle')
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [isPending, startTransition] = useTransition()

  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [canRecord, setCanRecord] = useState(false)

  // Podporu mikrofonu zjistíme až v prohlížeči, na serveru ji znát nelze.
  useEffect(() => {
    setCanRecord(
      voiceEnabled &&
        typeof navigator !== 'undefined' &&
        Boolean(navigator.mediaDevices?.getUserMedia) &&
        Boolean(pickMimeType()),
    )
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      recorderRef.current?.stream.getTracks().forEach(t => t.stop())
    }
  }, [voiceEnabled])

  function stopTimer() {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
  }

  async function startRecording() {
    setError(null)
    const mimeType = pickMimeType()
    if (!mimeType) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream, { mimeType })
      chunksRef.current = []
      recorder.ondataavailable = e => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
        stopTimer()
        void transcribe(new Blob(chunksRef.current, { type: recorder.mimeType || mimeType }))
      }
      recorderRef.current = recorder
      recorder.start()
      setVoice('recording')
      setSeconds(0)
      timerRef.current = setInterval(() => {
        setSeconds(s => {
          if (s + 1 >= MAX_RECORDING_SECONDS) recorder.state === 'recording' && recorder.stop()
          return s + 1
        })
      }, 1000)
    } catch {
      setError('Mikrofon se nepodařilo zapnout. Povolte ho prosím v prohlížeči, nebo napište text.')
      setVoice('idle')
    }
  }

  function stopRecording() {
    const recorder = recorderRef.current
    if (recorder && recorder.state === 'recording') recorder.stop()
  }

  async function transcribe(audio: Blob) {
    setVoice('transcribing')
    try {
      const form = new FormData()
      form.append('audio', audio, 'nahravka')
      const res = await fetch(transcribeUrl ?? `/api/public/portal/${token}/transcribe`, { method: 'POST', body: form })
      const data = (await res.json().catch(() => null)) as { success?: boolean; text?: string; error?: string } | null
      if (res.ok && data?.success && data.text) {
        setText(prev => (prev.trim() ? `${prev.trim()}\n${data.text}` : data.text!))
        setFromVoice(true)
      } else {
        setError(data?.error ?? 'Nahrávku se nepodařilo přepsat. Napište prosím text.')
      }
    } catch {
      setError('Nahrávku se nepodařilo odeslat. Zkontrolujte připojení, nebo napište text.')
    } finally {
      setVoice('idle')
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (text.trim().length < 3) {
      setError('Napište prosím alespoň pár slov.')
      return
    }
    setError(null)
    startTransition(async () => {
      const data = { text, source: fromVoice ? ('voice' as const) : ('text' as const) }
      const res = submit ? await submit(data) : await submitClientRequest(token ?? '', data)
      if (res.success) setSubmitted(true)
      else setError(res.error ?? 'Požadavek se nepodařilo odeslat.')
    })
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center">
          <CheckCircle2 size={22} strokeWidth={1.5} className="text-emerald-600" />
        </div>
        <p className="font-semibold text-foreground text-sm">Požadavek jsme přijali.</p>
        <p className="text-xs text-muted-foreground max-w-xs">Ozveme se vám. Další můžete poslat kdykoli.</p>
        <button
          type="button"
          onClick={() => {
            setText('')
            setFromVoice(false)
            setSubmitted(false)
          }}
          className="text-xs font-medium text-navy-700 hover:underline"
        >
          Poslat další požadavek
        </button>
      </div>
    )
  }

  const busy = isPending || voice === 'transcribing'

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex items-center gap-2">
        <MessageSquarePlus size={13} strokeWidth={1.5} className="text-navy-500" />
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Máte požadavek nebo změnu?</p>
      </div>

      <textarea
        value={text}
        onChange={e => {
          setText(e.target.value)
          if (!e.target.value) setFromVoice(false)
        }}
        maxLength={REQUEST_MAX_CHARS}
        rows={4}
        disabled={voice !== 'idle'}
        placeholder="Napište, co byste chtěli změnit nebo doplnit…"
        className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-navy-300 disabled:opacity-60"
      />

      {fromVoice && voice === 'idle' && (
        <p className="text-xs text-muted-foreground">Text vznikl z vaší nahrávky. Zkontrolujte ho prosím, než ho odešlete.</p>
      )}

      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {canRecord && (
          <button
            type="button"
            onClick={voice === 'recording' ? stopRecording : startRecording}
            disabled={busy}
            className={cn(
              'inline-flex min-h-[44px] items-center gap-2 rounded-lg border px-3.5 text-sm font-medium transition-colors disabled:opacity-60',
              voice === 'recording'
                ? 'border-red-300 bg-red-50 text-red-700'
                : 'border-border bg-white text-foreground hover:bg-navy-50',
            )}
          >
            {voice === 'recording' ? (
              <>
                <Square size={14} strokeWidth={1.5} /> Zastavit ({seconds} s)
              </>
            ) : voice === 'transcribing' ? (
              <>
                <Loader2 size={14} strokeWidth={1.5} className="animate-spin" /> Přepisuji…
              </>
            ) : (
              <>
                <Mic size={14} strokeWidth={1.5} /> Nadiktovat
              </>
            )}
          </button>
        )}
        <button
          type="submit"
          disabled={busy || voice === 'recording' || text.trim().length < 3}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-lg brand-gradient px-4 text-sm font-medium text-white shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {isPending && <Loader2 size={14} strokeWidth={1.5} className="animate-spin" />}
          Odeslat požadavek
        </button>
      </div>

      {canRecord && (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Nahrávku převede na text služba OpenAI. Nahrávku neukládáme, uložíme jen text, který odešlete.
        </p>
      )}
    </form>
  )
}
