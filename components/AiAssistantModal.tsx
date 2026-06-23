'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Loader2, Send, X } from 'lucide-react'
import type { StartupProject, StartupChangelogEntry, StartupImprovement } from '@/lib/types'

export interface Assistant {
  icon: string
  name: string
  description: string
  role: string
}

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface Props {
  assistant: Assistant | null
  project: StartupProject
  changelog?: StartupChangelogEntry[]
  improvements?: StartupImprovement[]
  onClose: () => void
}

function buildSystemPrompt(
  assistant: Assistant,
  project: StartupProject,
  changelog?: StartupChangelogEntry[],
  improvements?: StartupImprovement[]
): string {
  const projectContext = `
Startup projekt:
- Název: ${project.name}
- Segment: ${project.segment}
- Problém: ${project.problem}
- Fáze: ${project.phase}
- Postup: ${project.progress} %
- Monetizace: ${project.monetization ? 'Ano' : 'Ne'}
- Live URL: ${project.live_url ?? 'není'}
- Plánovaná investice: ${project.planned_investment ? `${project.planned_investment} ${project.currency}` : 'neurčena'}
- Celkový počet uživatelů: ${project.total_users ?? 'neznámý'}
- % platících uživatelů: ${project.paying_users_pct ?? 'neznámé'}
`.trim()

  let extra = ''

  if (assistant.role === 'pravá ruka' && changelog && improvements) {
    const recentChangelog = changelog.slice(0, 10).map(e =>
      `[${e.change_date}] ${e.change_type}: ${e.description}`
    ).join('\n')
    const pendingImprovements = improvements.filter(i => i.status !== 'done').map(i =>
      `[${i.status}] ${i.content}`
    ).join('\n')

    extra = `

Posledních 10 záznamů changelogu:
${recentChangelog || 'žádné'}

Nevyřešené nápady na zlepšení:
${pendingImprovements || 'žádné'}
`
  }

  return `Jsi ${assistant.icon} ${assistant.name} — ${assistant.description}

Komunikuješ výhradně česky. Jsi konkrétní, praktický a bez zbytečného omáčkování. Odpovídáš stručně a k věci — maximálně 3–5 odstavců pokud není potřeba více.

${projectContext}${extra}`
}

export function AiAssistantModal({ assistant, project, changelog, improvements, onClose }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (assistant) {
      setMessages([])
      setInput('')
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [assistant?.name])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    if (!input.trim() || loading || !assistant) return

    const userMessage: Message = { role: 'user', content: input.trim() }
    const newMessages = [...messages, userMessage]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/ai-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages,
          systemPrompt: buildSystemPrompt(assistant, project, changelog, improvements),
        }),
      })
      const data = await res.json()
      if (data.content) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.content }])
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Nepodařilo se získat odpověď. Zkus to znovu.' }])
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
      {assistant && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) onClose() }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.18 }}
            className="bg-white rounded-2xl border border-border shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xl">{assistant.icon}</span>
                  <h2 className="text-base font-semibold text-foreground">{assistant.name}</h2>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{assistant.description}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
              >
                <X size={16} strokeWidth={1.5} />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 min-h-0">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-32 text-center">
                  <span className="text-3xl mb-2">{assistant.icon}</span>
                  <p className="text-sm text-muted-foreground">
                    Zeptej se mě na cokoliv ohledně projektu <strong>{project.name}</strong>
                  </p>
                </div>
              )}
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                      msg.role === 'user'
                        ? 'bg-brand-600 text-white rounded-br-sm'
                        : 'bg-muted text-foreground rounded-bl-sm'
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-muted px-4 py-3 rounded-2xl rounded-bl-sm flex items-center gap-2">
                    <Loader2 size={14} strokeWidth={1.5} className="animate-spin text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Přemýšlím…</span>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="px-6 py-4 border-t border-border shrink-0">
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Napiš zprávu… (Enter = odeslat, Shift+Enter = nový řádek)"
                  rows={2}
                  className="flex-1 px-3.5 py-2.5 text-sm border border-border rounded-xl bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-colors resize-none"
                />
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={loading || !input.trim()}
                  className="p-2.5 bg-brand-600 text-white rounded-xl hover:bg-brand-700 disabled:opacity-40 transition-colors shrink-0"
                >
                  <Send size={16} strokeWidth={1.5} />
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
