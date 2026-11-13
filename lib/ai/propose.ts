import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { aiModel, isAiConfigured } from '@/lib/ai/models'
import { PROPOSE_PROMPT, proposeCatalogue } from '@/lib/ai/prompts'
import { loadAiContext, type ContextRef } from '@/lib/ai/context'
import { stripMarkers } from '@/lib/ai/markers'
import { suggestionSchema, CONFIDENCE_FLOOR, type Suggestion } from '@/lib/ai/suggestion-schema'
import { redactSensitive } from '@/lib/project-activity'
import { getPragueTodayISO } from '@/lib/prague-time'

/**
 * Věta → typovaný návrh akce (AD14).
 *
 * Strukturovaný výstup (`messages.parse` + `zodOutputFormat`), **ne nástroje**:
 * model nemá konat, má vrátit vyplněný formulář ke schválení. Vynucené
 * `tool_choice: any|tool` navíc na opus-5-5 a sonnet-5-5 vrací 400.
 *
 * Dvě kola, ne víc: `fast` (haiku) zkusí větu rozluštit a jen když řekne
 * „nevím" (`kind: 'none'`) nebo si není jistý, ptá se `smart` (sonnet).
 * Druhé kolo se tak platí jen u vět, na kterých levný model opravdu selhal.
 *
 * Nikdy nevyhazuje — vrací `error` s českou hláškou. Asistent je nabídka,
 * ne krok navíc.
 */

export type ProposeResult =
  | { suggestion: Suggestion; model: string; tokensIn: number | null; tokensOut: number | null }
  | { error: string }

/** Strop odpovědi. Návrh je pár polí, dlouhý být nemá. */
const MAX_TOKENS = 1500

async function callModel(
  model: string,
  text: string,
  context: string,
): Promise<{ suggestion: Suggestion | null; tokensIn: number | null; tokensOut: number | null }> {
  const client = new Anthropic({ timeout: 30_000, maxRetries: 1 })

  // Stabilní prefix = systémový prompt + katalog stavů a druhů akcí. Mění se
  // jen s nasazením, takže se dá číst z cache; věta uživatele a čerstvý
  // kontext jdou až za ním, ve zprávě. Kontrola: `usage.cache_read_input_tokens`
  // má být po druhém dotazu nenulové — nula znamená, že prefix něco rozbíjí.
  const system: Anthropic.TextBlockParam[] = [
    { type: 'text', text: PROPOSE_PROMPT },
    { type: 'text', text: proposeCatalogue(), cache_control: { type: 'ephemeral' } },
  ]

  const response = await client.messages.parse({
    model,
    max_tokens: MAX_TOKENS,
    system,
    output_config: { effort: 'low', format: zodOutputFormat(suggestionSchema) },
    messages: [
      {
        role: 'user',
        content: [`Dnes je ${getPragueTodayISO()}.`, context, '', `<veta>\n${text}\n</veta>`]
          .filter(Boolean)
          .join('\n'),
      },
    ],
  })

  return {
    suggestion: (response.parsed_output as Suggestion | null) ?? null,
    tokensIn: response.usage?.input_tokens ?? null,
    tokensOut: response.usage?.output_tokens ?? null,
  }
}

export async function proposeAction(input: {
  text: string
  contextRef?: ContextRef | null
}): Promise<ProposeResult> {
  if (!isAiConfigured()) return { error: 'Asistent není nakonfigurovaný.' }

  // Zakrytí dřív, než věta odejde k modelu i než se uloží do `ai_suggestions`.
  const text = stripMarkers(redactSensitive(input.text).text).trim()
  if (!text) return { error: 'Napište, co se má stát.' }

  const context = (await loadAiContext(input.contextRef ?? null)).text

  try {
    const fast = aiModel('fast')
    let model = fast
    let out = await callModel(fast, text, context)

    // Druhé kolo jen tam, kde levný model nestačil: nic nevymyslel, nerozumí
    // větě, nebo si není jistý. Jinak by sonnet jel na každé větě zbytečně.
    const needsSmart =
      !out.suggestion || out.suggestion.proposal.kind === 'none' || out.suggestion.confidence < CONFIDENCE_FLOOR
    const smart = aiModel('smart')
    if (needsSmart && smart !== fast) {
      const second = await callModel(smart, text, context)
      if (second.suggestion) {
        model = smart
        out = second
      }
    }

    if (!out.suggestion) return { error: 'Z věty se nepodařilo udělat návrh. Zkuste to říct jinak.' }
    return { suggestion: out.suggestion, model, tokensIn: out.tokensIn, tokensOut: out.tokensOut }
  } catch (err) {
    console.error('[ai-propose] návrh selhal:', err instanceof Error ? err.name : 'unknown')
    if (err instanceof Anthropic.RateLimitError) {
      return { error: 'AI je momentálně přetížená — zkuste to za chvíli.' }
    }
    if (err instanceof Anthropic.AuthenticationError) {
      return { error: 'Asistent není správně nakonfigurovaný.' }
    }
    return { error: 'Návrh se nepodařilo vytvořit. Zkuste to znovu.' }
  }
}
