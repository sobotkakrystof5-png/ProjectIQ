'use client'

import { Fragment, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Check, CheckCheck, ClipboardCheck, CornerUpLeft, ExternalLink, FileText, Loader2, Mic, Paperclip, Send, Square, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { pragueDayOf } from '@/lib/prague-time'
import { CHAT_MAX_BODY, CHAT_MAX_FILES, CHAT_MAX_TOTAL_BYTES, REQUEST_STATUS_CHAT, type ChatMessage, type ChatReads } from '@/lib/chat/types'
import { useVoice } from '@/components/chat/use-voice'

/**
 * Vlákno chatu u zakázky (KP15, R-122, R-123) — stejné pro klienta
 * i schránku Zprávy v adminu. Bubliny, oddělovače dnů, nejnovější dole,
 * pole přilepené dole. U vlastní zprávy jedna fajfka = odesláno, dvě =
 * přečteno; po klepnutí „Přečteno 14:32 · jméno". Text klienta je jen text.
 */

type Result = { success: boolean; error?: string }

export type ChatThreadProps = {
  viewer: 'client' | 'admin'
  projectId: string
  messages: ChatMessage[]
  reads: ChatReads
  sendUrl: string
  attachmentBase: string
  transcribeUrl: string | null
  /** Jak se jmenuje druhá strana (podpis zpráv bez jména). */
  otherName: string
  onAnswerApproval?: (messageId: string, raw: { decision: 'approved' | 'changes'; body: string }) => Promise<Result>
  onMakeRequest?: (projectId: string, messageIds: string[]) => Promise<Result & { requestId?: string }>
}

const TIME = new Intl.DateTimeFormat('cs-CZ', { timeZone: 'Europe/Prague', hour: 'numeric', minute: '2-digit' })
const DAY = new Intl.DateTimeFormat('cs-CZ', { timeZone: 'Europe/Prague', weekday: 'long', day: 'numeric', month: 'long' })

function dayHeading(iso: string): string {
  const day = pragueDayOf(iso)
  const today = pragueDayOf(new Date())
  const yesterday = pragueDayOf(new Date(Date.now() - 86_400_000))
  if (day === today) return 'Dnes'
  if (day === yesterday) return 'Včera'
  return DAY.format(new Date(iso))
}

const kB = (n: number) => (n >= 1_048_576 ? `${(n / 1_048_576).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(n / 1024))} kB`)

export function ChatThread(props: ChatThreadProps) {
  const { viewer, projectId, messages, reads, attachmentBase, otherName } = props
  const router = useRouter()
  const list = useRef<HTMLOListElement>(null)
  // Čára „Nové zprávy" zůstane, kde byla při otevření, i když se mezitím zapíše přečteno.
  const [firstReadAt] = useState(reads.myReadAt)
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [openTicks, setOpenTicks] = useState<string | null>(null)

  const firstNew = useMemo(() => {
    const other = viewer === 'client' ? 'admin' : 'client'
    return messages.find((m) => m.author === other && (!firstReadAt || m.createdAt > firstReadAt))?.id ?? null
  }, [messages, firstReadAt, viewer])

  // Nejnovější dole: posune se jen vlákno, ne celá stránka.
  useEffect(() => {
    const el = list.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length])

  const mine = (m: ChatMessage) => m.author === viewer
  const nameOf = (m: ChatMessage) =>
    m.authorName ?? (m.author === 'admin' ? (viewer === 'admin' ? 'Vy' : otherName) : viewer === 'client' ? 'Vy' : otherName)
  const read = (m: ChatMessage) => Boolean(reads.otherReadAt && reads.otherReadAt >= m.createdAt)
  const selectable = (m: ChatMessage) =>
    viewer === 'admin' && m.author === 'client' && m.kind !== 'request' && m.kind !== 'approval' && !m.requestStatus

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {viewer === 'admin' && selected.length > 0 && props.onMakeRequest && (
        <MakeRequestBar
          count={selected.length}
          onCancel={() => setSelected([])}
          onConfirm={async () => {
            const res = await props.onMakeRequest!(projectId, selected)
            if (!res.success) return res.error ?? 'Zadání se nepodařilo udělat.'
            setSelected([])
            setNotice('Zadání je v Požadavcích klientů. Shrnutí a příkaz pro Claude Code se připravují.')
            router.refresh()
            return null
          }}
        />
      )}

      <ol ref={list} className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-4 sm:px-5" aria-label="Zprávy">
        {messages.length === 0 && (
          <li className="py-10 text-center text-sm text-quiet">
            {viewer === 'client'
              ? 'Zatím tu nic není. Napište, co potřebujete — odpovím co nejdřív.'
              : 'Zatím žádné zprávy. Napište klientovi první.'}
          </li>
        )}
        {messages.map((m, i) => {
          const prev = messages[i - 1]
          const newDay = !prev || pragueDayOf(prev.createdAt) !== pragueDayOf(m.createdAt)
          const own = mine(m)
          return (
            <Fragment key={m.id}>
              {newDay && (
                <li className="py-3 text-center">
                  <span className="rounded-full bg-navy-50 px-3 py-1 text-xs font-medium text-quiet">{dayHeading(m.createdAt)}</span>
                </li>
              )}
              {m.id === firstNew && (
                <li className="flex items-center gap-3 py-2" aria-label="Nové zprávy">
                  <span className="h-px flex-1 bg-signal-line" />
                  <span className="text-xs font-semibold text-signal-ink">Nové zprávy</span>
                  <span className="h-px flex-1 bg-signal-line" />
                </li>
              )}
              <li className={cn('flex items-end gap-1', own ? 'justify-end' : 'justify-start')}>
                {selectable(m) && (
                  <label className="order-first flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center" title="Vybrat do zadání">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-navy-700"
                      checked={selected.includes(m.id)}
                      onChange={(e) => setSelected((s) => (e.target.checked ? [...s, m.id] : s.filter((x) => x !== m.id)))}
                      aria-label="Vybrat zprávu do zadání"
                    />
                  </label>
                )}
                {own && m.kind !== 'request' && <ReplyButton onClick={() => setReplyTo(m)} />}
                <div
                  className={cn(
                    'max-w-[85%] rounded-box px-3.5 py-2.5 sm:max-w-[70%]',
                    own ? 'bg-navy-700 text-white' : 'border border-navy-100 bg-surface text-ink',
                    m.kind === 'approval' && !own && 'border-navy-300',
                  )}
                >
                  {!own && <p className="mb-0.5 text-xs font-semibold text-navy-700">{nameOf(m)}</p>}
                  {m.kind === 'approval' && (
                    <p className={cn('mb-1 inline-flex items-center gap-1 text-xs font-semibold', own ? 'text-navy-100' : 'text-navy-700')}>
                      <ClipboardCheck size={13} strokeWidth={1.5} aria-hidden="true" /> Ke schválení
                    </p>
                  )}
                  {m.kind === 'request' && <p className={cn('mb-1 text-xs font-semibold', own ? 'text-navy-100' : 'text-quiet')}>Požadavek</p>}
                  {m.replyTo && (
                    <p className={cn('mb-1.5 line-clamp-2 border-l-2 pl-2 text-xs', own ? 'border-navy-300 text-navy-100' : 'border-navy-200 text-quiet')}>
                      <span className="font-semibold">{m.replyTo.authorName ?? 'Zpráva'}: </span>
                      {m.replyTo.body || 'Příloha'}
                    </p>
                  )}
                  {m.body && <p className="whitespace-pre-wrap break-words text-sm">{m.body}</p>}
                  {m.approvalUrl && (
                    <a
                      href={m.approvalUrl}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className={cn('mt-1.5 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold underline', own ? 'text-white' : 'text-navy-700')}
                    >
                      <ExternalLink size={14} strokeWidth={1.5} aria-hidden="true" /> Otevřít náhled
                    </a>
                  )}
                  {m.attachments.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {m.attachments.map((a) =>
                        a.mime.startsWith('image/') ? (
                          <a key={a.id} href={`${attachmentBase}/${a.id}`} target="_blank" rel="noopener noreferrer" className="block">
                            {/* eslint-disable-next-line @next/next/no-img-element -- soubor jde přes naši routu s kontrolou členství */}
                            <img src={`${attachmentBase}/${a.id}`} alt={a.filename} loading="lazy" className="max-h-64 rounded-chip object-contain" />
                          </a>
                        ) : (
                          <a
                            key={a.id}
                            href={`${attachmentBase}/${a.id}`}
                            className={cn('flex min-h-11 items-center gap-2 rounded-chip px-2 text-sm', own ? 'bg-navy-800' : 'bg-navy-50')}
                          >
                            <FileText size={16} strokeWidth={1.5} aria-hidden="true" />
                            <span className="min-w-0 flex-1 truncate">{a.filename}</span>
                            <span className="shrink-0 text-xs opacity-70">{kB(a.size)}</span>
                          </a>
                        ),
                      )}
                    </div>
                  )}
                  {m.kind === 'approval' && (
                    <ApprovalState message={m} viewer={viewer} onAnswer={props.onAnswerApproval} />
                  )}
                  {m.requestStatus && (
                    <p className={cn('mt-1.5 text-xs font-semibold', own ? 'text-navy-100' : 'text-navy-700')}>
                      Zadání: {REQUEST_STATUS_CHAT[m.requestStatus]}
                    </p>
                  )}
                  <p className={cn('mt-1 flex items-center justify-end gap-1 text-[11px]', own ? 'text-navy-200' : 'text-quiet')}>
                    {TIME.format(new Date(m.createdAt))}
                    {own && m.kind !== 'request' && (
                      <button
                        type="button"
                        onClick={() => setOpenTicks((x) => (x === m.id ? null : m.id))}
                        className="-my-2 inline-flex h-8 items-center px-1"
                        aria-label={read(m) ? 'Přečteno' : 'Odesláno'}
                      >
                        {read(m) ? <CheckCheck size={14} strokeWidth={2} /> : <Check size={14} strokeWidth={2} />}
                      </button>
                    )}
                  </p>
                  {openTicks === m.id && (
                    <p className="mt-0.5 text-right text-[11px] text-navy-100">
                      {read(m) && reads.otherReadAt
                        ? `Přečteno ${TIME.format(new Date(reads.otherReadAt))}${reads.otherReaderName ? ` · ${reads.otherReaderName}` : ''}`
                        : 'Odesláno, zatím nepřečteno'}
                    </p>
                  )}
                </div>
                {!own && m.kind !== 'request' && <ReplyButton onClick={() => setReplyTo(m)} />}
              </li>
            </Fragment>
          )
        })}
      </ol>

      {notice && <p role="status" className="border-t border-navy-100 px-4 py-2 text-sm text-ink">{notice}</p>}
      <Composer {...props} replyTo={replyTo} onClearReply={() => setReplyTo(null)} />
    </div>
  )
}

function ReplyButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-quiet hover:bg-navy-50 hover:text-ink"
      aria-label="Odpovědět na zprávu"
      title="Odpovědět"
    >
      <CornerUpLeft size={15} strokeWidth={1.5} />
    </button>
  )
}

function ApprovalState({
  message,
  viewer,
  onAnswer,
}: {
  message: ChatMessage
  viewer: 'client' | 'admin'
  onAnswer?: ChatThreadProps['onAnswerApproval']
}) {
  const [mode, setMode] = useState<'idle' | 'changes'>('idle')
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const router = useRouter()

  if (message.approvalState === 'approved') return <p className="mt-2 text-sm font-semibold">Schváleno</p>
  if (message.approvalState === 'changes') return <p className="mt-2 text-sm font-semibold">Klient chce změny</p>
  if (viewer === 'admin' || !onAnswer) return <p className="mt-2 text-xs opacity-80">Čeká na odpověď klienta</p>

  const answer = (decision: 'approved' | 'changes') =>
    start(async () => {
      setError(null)
      const res = await onAnswer(message.id, { decision, body: decision === 'changes' ? text : '' })
      if (!res.success) return setError(res.error ?? 'Něco se nepovedlo. Zkuste to prosím znovu.')
      router.refresh()
    })

  return (
    <div className="mt-2 space-y-2">
      {mode === 'changes' && (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="Co chcete změnit?"
          aria-label="Co chcete změnit"
          className="w-full resize-none rounded-chip border border-navy-100 bg-surface px-3 py-2 text-sm text-ink placeholder:text-quiet focus:outline-none focus:ring-2 focus:ring-navy-700"
        />
      )}
      <div className="flex flex-wrap gap-2">
        {mode === 'idle' ? (
          <>
            <button type="button" disabled={pending} onClick={() => answer('approved')} className="inline-flex min-h-11 items-center rounded-chip bg-navy-700 px-4 text-sm font-semibold text-white hover:bg-navy-800 disabled:opacity-60">
              Schvaluji
            </button>
            <button type="button" disabled={pending} onClick={() => setMode('changes')} className="inline-flex min-h-11 items-center rounded-chip border border-navy-200 px-4 text-sm font-semibold text-ink hover:bg-navy-50 disabled:opacity-60">
              Chci změny
            </button>
          </>
        ) : (
          <>
            <button type="button" disabled={pending} onClick={() => answer('changes')} className="inline-flex min-h-11 items-center rounded-chip bg-navy-700 px-4 text-sm font-semibold text-white hover:bg-navy-800 disabled:opacity-60">
              Poslat změny
            </button>
            <button type="button" disabled={pending} onClick={() => setMode('idle')} className="inline-flex min-h-11 items-center rounded-chip px-3 text-sm text-quiet hover:bg-navy-50">
              Zpět
            </button>
          </>
        )}
      </div>
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </div>
  )
}

function MakeRequestBar({ count, onCancel, onConfirm }: { count: number; onCancel: () => void; onConfirm: () => Promise<string | null> }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-navy-100 bg-navy-50 px-4 py-2">
      <span className="text-sm text-ink">Vybráno: {count}</span>
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => setError(await onConfirm()))}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-chip bg-navy-700 px-4 text-sm font-semibold text-white hover:bg-navy-800 disabled:opacity-60"
      >
        {pending && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
        Udělat z toho zadání
      </button>
      <button type="button" onClick={onCancel} className="inline-flex min-h-11 items-center rounded-chip px-3 text-sm text-quiet hover:bg-surface">
        Zrušit výběr
      </button>
      {error && <p role="alert" className="w-full text-xs text-danger">{error}</p>}
    </div>
  )
}

/**
 * Fotka z telefonu bývá větší než limit odeslání (4 MB). Obrázek nad 1,5 MB
 * se v prohlížeči zmenší na nejvýš 2560 px a uloží jako JPEG — do chatu stačí.
 * PDF se nemění.
 */
async function shrinkImage(file: File): Promise<File> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size <= 1.5 * 1024 * 1024) return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, 2560 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
    if (!blob || blob.size >= file.size) return file
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    return file
  }
}

function Composer({
  viewer,
  projectId,
  sendUrl,
  transcribeUrl,
  replyTo,
  onClearReply,
}: ChatThreadProps & { replyTo: ChatMessage | null; onClearReply: () => void }) {
  const router = useRouter()
  const [body, setBody] = useState('')
  const [kind, setKind] = useState<'text' | 'voice' | 'approval'>('text')
  const [approvalUrl, setApprovalUrl] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const fileInput = useRef<HTMLInputElement>(null)
  const voice = useVoice(
    transcribeUrl,
    (text) => {
      setBody((prev) => (prev.trim() ? `${prev.trim()}\n${text}` : text))
      setKind((k) => (k === 'approval' ? k : 'voice'))
    },
    setError,
  )

  const tooBig = files.reduce((sum, f) => sum + f.size, 0) > CHAT_MAX_TOTAL_BYTES
  const canSend = (body.trim().length > 0 || files.length > 0) && !tooBig && !pending && voice.state === 'idle'

  function send() {
    if (!canSend) return
    setError(null)
    start(async () => {
      const form = new FormData()
      form.set('projectId', projectId)
      form.set('kind', kind)
      form.set('body', body)
      if (replyTo && !replyTo.id.startsWith('pozadavek-')) form.set('replyTo', replyTo.id)
      if (kind === 'approval') form.set('approvalUrl', approvalUrl)
      files.forEach((f) => form.append('soubor', f))
      try {
        const res = await fetch(sendUrl, { method: 'POST', body: form })
        const data = (await res.json().catch(() => null)) as { success?: boolean; error?: string } | null
        if (!res.ok || !data?.success) return setError(data?.error ?? 'Zprávu se nepodařilo odeslat. Zkuste to prosím znovu.')
        setBody('')
        setFiles([])
        setKind('text')
        setApprovalUrl('')
        onClearReply()
        router.refresh()
      } catch {
        setError('Zprávu se nepodařilo odeslat. Zkontrolujte připojení a zkuste to znovu.')
      }
    })
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter odešle na počítači, Shift+Enter nový řádek. Na telefonu Enter píše řádek.
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia('(pointer: fine)').matches) {
      e.preventDefault()
      send()
    }
  }

  return (
    <div className="border-t border-navy-100 bg-surface px-3 py-2.5 sm:px-4">
      {replyTo && (
        <div className="mb-2 flex items-start gap-2 rounded-chip bg-navy-50 px-3 py-1.5 text-xs text-quiet">
          <CornerUpLeft size={13} strokeWidth={1.5} className="mt-0.5 shrink-0" aria-hidden="true" />
          <p className="line-clamp-2 min-w-0 flex-1">{replyTo.body || 'Příloha'}</p>
          <button type="button" onClick={onClearReply} className="-m-2 inline-flex h-11 w-11 items-center justify-center" aria-label="Zrušit odpověď">
            <X size={14} />
          </button>
        </div>
      )}
      {viewer === 'admin' && kind === 'approval' && (
        <input
          type="url"
          value={approvalUrl}
          onChange={(e) => setApprovalUrl(e.target.value)}
          placeholder="Odkaz na náhled (nepovinné), https://…"
          aria-label="Odkaz na náhled"
          className="mb-2 w-full rounded-chip border border-navy-100 bg-surface px-3 py-2 text-sm text-ink placeholder:text-quiet focus:outline-none focus:ring-2 focus:ring-navy-700"
        />
      )}
      {files.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-2">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-1 rounded-full bg-navy-50 py-1 pl-3 text-xs text-ink">
              <span className="max-w-[10rem] truncate">{f.name}</span>
              <button type="button" onClick={() => setFiles((x) => x.filter((_, j) => j !== i))} className="inline-flex h-8 w-8 items-center justify-center" aria-label={`Odebrat ${f.name}`}>
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-end gap-1.5">
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp,application/pdf"
          multiple
          className="hidden"
          onChange={async (e) => {
            const input = e.target
            const picked = await Promise.all(Array.from(input.files ?? []).map(shrinkImage))
            input.value = ''
            setFiles((x) => {
              const next = [...x, ...picked].slice(0, CHAT_MAX_FILES)
              const total = next.reduce((sum, f) => sum + f.size, 0)
              setError(total > CHAT_MAX_TOTAL_BYTES ? 'Soubory jsou dohromady moc velké. Najednou jde poslat nejvýš 4 MB.' : null)
              return next
            })
          }}
        />
        <button type="button" onClick={() => fileInput.current?.click()} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-quiet hover:bg-navy-50 hover:text-ink" aria-label="Přidat obrázek nebo PDF">
          <Paperclip size={18} strokeWidth={1.5} />
        </button>
        <label htmlFor={`zprava-${projectId}`} className="sr-only">Zpráva</label>
        <textarea
          id={`zprava-${projectId}`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          maxLength={CHAT_MAX_BODY}
          placeholder={voice.state === 'recording' ? `Nahrávám… ${voice.seconds} s` : voice.state === 'transcribing' ? 'Přepisuji…' : 'Napište zprávu…'}
          className="max-h-40 min-h-11 flex-1 resize-none rounded-chip border border-navy-100 bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-quiet focus:outline-none focus:ring-2 focus:ring-navy-700 [field-sizing:content]"
        />
        {voice.available && (
          voice.state === 'recording' ? (
            <button type="button" onClick={voice.stop} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-danger text-white" aria-label="Ukončit nahrávání">
              <Square size={14} fill="currentColor" />
            </button>
          ) : (
            <button type="button" onClick={voice.start} disabled={voice.state !== 'idle'} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-quiet hover:bg-navy-50 hover:text-ink disabled:opacity-50" aria-label="Nadiktovat zprávu">
              {voice.state === 'transcribing' ? <Loader2 size={18} className="animate-spin" /> : <Mic size={18} strokeWidth={1.5} />}
            </button>
          )
        )}
        <button type="button" onClick={send} disabled={!canSend} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-navy-700 text-white hover:bg-navy-800 disabled:opacity-40" aria-label="Odeslat">
          {pending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} strokeWidth={1.75} />}
        </button>
      </div>
      {viewer === 'admin' && (
        <label className="mt-1.5 inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm text-quiet">
          <input type="checkbox" checked={kind === 'approval'} onChange={(e) => setKind(e.target.checked ? 'approval' : 'text')} className="h-4 w-4 accent-navy-700" />
          Poslat ke schválení (klient klikne Schvaluji, nebo napíše změny)
        </label>
      )}
      {error && <p role="alert" className="mt-1.5 text-sm text-danger">{error}</p>}
    </div>
  )
}
