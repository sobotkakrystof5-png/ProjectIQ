import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { aiModel, isAiConfigured } from '@/lib/ai/models'
import { consultPrompt } from '@/lib/ai/prompts'
import { CONSULT_MODES } from '@/lib/ai/consultants'
import { HISTORY_MAX, TEXT_MAX } from '@/lib/ai/assistant-limits'
import { loadAiContext, CONTEXT_KINDS } from '@/lib/ai/context'
import { redactSensitive } from '@/lib/project-activity'

/**
 * Konzultace s asistentem (AD14) — odpověď textem, nic se nikam nezapisuje.
 *
 * Celé tělo požadavku prochází Zodem. Z prohlížeče smí přijít jen `mode`
 * z výčtu, text do 2000 znaků, odkaz na kontext a krátká historie hovoru;
 * **systémový prompt ani kontext z prohlížeče nepřijímáme** — to byla díra,
 * kterou AD14 zavírá.
 */

export const assistantRequestSchema = z.object({
  mode: z.enum(CONSULT_MODES),
  text: z.string().trim().min(1).max(TEXT_MAX),
  contextRef: z
    .object({ kind: z.enum(CONTEXT_KINDS), id: z.string().uuid() })
    .nullish(),
  /** Předchozí repliky téhož hovoru. Role jen `user`/`assistant`, nic jiného. */
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(TEXT_MAX) }))
    .max(HISTORY_MAX)
    .optional(),
})

export type AssistantRequest = z.infer<typeof assistantRequestSchema>

export type AssistantResult = { content: string } | { error: string }

/** Odpověď je krátká (tři až pět odstavců), strop drží cenu jednoho dotazu. */
const MAX_TOKENS = 1200

export async function askAssistant(input: AssistantRequest): Promise<AssistantResult> {
  if (!isAiConfigured()) return { error: 'AI asistent není nakonfigurovaný.' }

  // Vstup se zakrývá dřív, než odejde k modelu i než se cokoli uloží:
  // do okénka asistenta se dá omylem vložit řádek z `.env` nebo klíč.
  const text = redactSensitive(input.text).text
  const context = await loadAiContext(input.contextRef ?? null)

  const system: Anthropic.TextBlockParam[] = [
    // Stabilní prefix = systémový prompt + kontext. Mění se jen při přepnutí
    // role nebo záznamu; věta uživatele je až ve zprávě, takže se prefix dá
    // číst z cache (`usage.cache_read_input_tokens` > 0).
    { type: 'text', text: consultPrompt(input.mode) },
    ...(context.text
      ? [{ type: 'text' as const, text: context.text, cache_control: { type: 'ephemeral' as const } }]
      : []),
  ]

  const messages: Anthropic.MessageParam[] = [
    ...(input.history ?? []).map((m) => ({
      role: m.role,
      content: redactSensitive(m.content).text,
    })),
    { role: 'user' as const, content: text },
  ]

  try {
    const client = new Anthropic({ timeout: 30_000, maxRetries: 1 })
    const response = await client.messages.create({
      model: aiModel('fast'),
      max_tokens: MAX_TOKENS,
      system,
      messages,
    })
    const content = response.content
      .filter((part): part is Anthropic.TextBlock => part.type === 'text')
      .map((part) => part.text)
      .join('\n')
      .trim()
    if (!content) return { error: 'Asistent neodpověděl. Zkus to znovu.' }
    return { content }
  } catch (err) {
    // Detail do logu, ne uživateli — může nést kus kontextu.
    console.error('[ai-assistant] dotaz selhal:', err instanceof Error ? err.name : 'unknown')
    if (err instanceof Anthropic.RateLimitError) {
      return { error: 'AI je momentálně přetížená — zkus to za chvíli.' }
    }
    if (err instanceof Anthropic.AuthenticationError) {
      return { error: 'AI asistent není správně nakonfigurovaný.' }
    }
    return { error: 'Odpověď se nepodařilo získat. Zkus to znovu.' }
  }
}
