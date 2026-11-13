'use client'

import { useState, useRef, useEffect } from 'react'
import { AnimatePresence, m } from 'framer-motion'
import { Loader2, Send, X } from 'lucide-react'
import { CONSULT_PROFILES, type ConsultMode } from '@/lib/ai/consultants'
import { HISTORY_MAX, TEXT_MAX } from '@/lib/ai/assistant-limits'

/**
 * Konzultace s asistentem u startupového projektu.
 *
 * Od AD14 posílá prohlížeč jen `mode`, větu a odkaz na projekt. Systémový
 * prompt i data projektu si bere server (`lib/ai/prompts.ts`,
 * `lib/ai/context.ts`) — dřív je skládala tahle komponenta a route je bez
 * kontroly předávala modelu.
 *
 * Odpověď se vykresluje jako text (`whitespace-pre-wrap`), nikdy jako HTML.
 */

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface Props {
  mode: ConsultMode | null
  projectId: string
  projectName: string
  onClose: () => void
}

export function AiAssistantModal({ mode, projectId, projectName, onClose }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const profile = mode ? CONSULT_PROFILES[mode] : null

  useEffect(() => {
    if (mode) {
      setMessages([])
      setInput('')
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [mode])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    const text = input.trim()
    if (!text || loading || !mode) return

    const history = messages.slice(-HISTORY_MAX)
    setMessages([...messages, { role: 'user', content: text }])
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/ai-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          text: text.slice(0, TEXT_MAX),
          contextRef: { kind: 'startup', id: projectId },
          history,
        }),
      })
      const data = await res.json()
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: typeof data.content === 'string' && data.content
            ? data.content
            : typeof data.error === 'string'
              ? data.error
              : 'Nepodařilo se získat odpověď. Zkus to znovu.',
        },
      ])
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Nepodařilo se získat odpověď. Zkus to znovu.' }])
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <AnimatePresence>
      {mode && profile && (
        <m.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/40 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) onClose() }}
        >
          <m.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.18 }}
            role="dialog"
            aria-modal="true"
            aria-label={profile.name}
            className="bg-surface rounded-panel border border-navy-100 shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
          >
            {/* Hlavička */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-navy-100 shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xl" aria-hidden="true">{profile.icon}</span>
                  <h2 className="text-base font-semibold text-ink">{profile.name}</h2>
                </div>
                <p className="text-xs text-quiet mt-0.5">{profile.description}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Zavřít"
                className="flex h-11 w-11 items-center justify-center text-quiet hover:text-ink hover:bg-accent rounded-chip transition-colors"
              >
                <X size={16} strokeWidth={1.5} aria-hidden="true" />
              </button>
            </div>

            {/* Zprávy */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 min-h-0">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-32 text-center">
                  <span className="text-3xl mb-2" aria-hidden="true">{profile.icon}</span>
                  <p className="text-sm text-quiet">
                    Zeptejte se na cokoli ohledně projektu <strong className="text-ink">{projectName}</strong>
                  </p>
                </div>
              )}
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[80%] px-4 py-3 rounded-panel text-sm leading-relaxed whitespace-pre-wrap ${
                      msg.role === 'user'
                        ? 'bg-navy-700 text-white'
                        : 'bg-accent text-ink'
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-accent px-4 py-3 rounded-panel flex items-center gap-2">
                    <Loader2 size={14} strokeWidth={1.5} className="animate-spin text-quiet" aria-hidden="true" />
                    <span className="text-sm text-quiet">Přemýšlím…</span>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Vstup */}
            <div className="px-6 py-4 border-t border-navy-100 shrink-0">
              <div className="flex items-end gap-2">
                <label htmlFor="asistent-vstup" className="sr-only">Zpráva asistentovi</label>
                <textarea
                  id="asistent-vstup"
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value.slice(0, TEXT_MAX))}
                  onKeyDown={handleKeyDown}
                  maxLength={TEXT_MAX}
                  placeholder="Napište zprávu… (Enter odešle, Shift+Enter nový řádek)"
                  rows={2}
                  className="flex-1 px-3.5 py-2.5 text-sm border border-navy-100 rounded-chip bg-background text-ink placeholder:text-quiet focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                />
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={loading || !input.trim()}
                  aria-label="Odeslat"
                  className="flex h-11 w-11 items-center justify-center bg-navy-700 text-white rounded-chip hover:bg-navy-800 disabled:opacity-40 transition-colors shrink-0"
                >
                  <Send size={16} strokeWidth={1.5} aria-hidden="true" />
                </button>
              </div>
            </div>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  )
}
