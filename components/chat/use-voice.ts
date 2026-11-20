'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Nahrání hlasu a přepis do textu (KP15) — stejná cesta jako požadavek
 * (R-069): nahrávka jde na přepis, audio se neukládá a text se vloží do pole,
 * kde ho člověk před odesláním vidí a opraví.
 */

const MAX_SECONDS = 120
const PREFERRED = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined
  return PREFERRED.find((t) => MediaRecorder.isTypeSupported(t))
}

export type VoiceState = 'idle' | 'recording' | 'transcribing'

export function useVoice(transcribeUrl: string | null, onText: (text: string) => void, onError: (msg: string) => void) {
  const [state, setState] = useState<VoiceState>('idle')
  const [seconds, setSeconds] = useState(0)
  const [available, setAvailable] = useState(false)
  const recorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    setAvailable(Boolean(transcribeUrl) && Boolean(navigator.mediaDevices?.getUserMedia) && Boolean(pickMimeType()))
    return () => {
      if (timer.current) clearInterval(timer.current)
      recorder.current?.stream.getTracks().forEach((t) => t.stop())
    }
  }, [transcribeUrl])

  async function transcribe(audio: Blob) {
    setState('transcribing')
    try {
      const form = new FormData()
      form.append('audio', audio, 'nahravka')
      const res = await fetch(transcribeUrl!, { method: 'POST', body: form })
      const data = (await res.json().catch(() => null)) as { success?: boolean; ok?: boolean; text?: string; error?: string } | null
      // Klientský přepis vrací `success`, adminský (`/api/ai-assistant/prepis`) `ok`.
      if (res.ok && (data?.success || data?.ok) && data.text) onText(data.text)
      else onError(data?.error ?? 'Nahrávku se nepodařilo přepsat. Napište prosím text.')
    } catch {
      onError('Nahrávku se nepodařilo přepsat. Napište prosím text.')
    } finally {
      setState('idle')
    }
  }

  async function start() {
    const mimeType = pickMimeType()
    if (!mimeType || state !== 'idle') return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const rec = new MediaRecorder(stream, { mimeType })
      chunks.current = []
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.current.push(e.data) }
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        if (timer.current) clearInterval(timer.current)
        void transcribe(new Blob(chunks.current, { type: rec.mimeType || mimeType }))
      }
      recorder.current = rec
      rec.start()
      setState('recording')
      setSeconds(0)
      timer.current = setInterval(() => {
        setSeconds((s) => {
          if (s + 1 >= MAX_SECONDS && rec.state === 'recording') rec.stop()
          return s + 1
        })
      }, 1000)
    } catch {
      onError('Mikrofon se nepodařilo zapnout. Povolte ho prosím v prohlížeči, nebo napište text.')
    }
  }

  function stop() {
    if (recorder.current?.state === 'recording') recorder.current.stop()
  }

  return { state, seconds, available, start, stop }
}
