import { AI_MODEL_DEFAULTS } from '@/lib/ai/models'

/**
 * ZakazIQ Voice (R-148): ceny na jednom místě (plán, oddíl 12).
 *
 * Ověřeno 2026-11-25: Groq console.groq.com/docs/speech-to-text (nejkratší
 * účtovaná délka 10 s), OpenAI developers.openai.com/api/docs/pricing
 * („Estimated cost" za minutu). Slouží k odhadu `voice_dictations.cost_usd`
 * a dennímu stropu (D-V11). Poskytovatelé účtují v USD, měny se nesčítají.
 * Čištění (Claude, VO07): ceník Claude API, stav 2026-11-03, ověřeno znovu
 * 2026-11-26 z reference Claude API (Haiku 5.5 $0,10 / $0,50, Sonnet 5.5 $2 / $10
 * za milion tokenů, u Haiku do 100 000 tokenů promptu — diktát je hluboko pod tím).
 */

/** USD za hodinu zvuku. Neznámý model = bez ceny (raději 0 než vymyšlené číslo). */
export const STT_PRICE_PER_HOUR: Readonly<Record<string, number>> = {
  'whisper-large-v3-turbo': 0.04,
  'whisper-large-v3': 0.111,
  'gpt-4o-transcribe': 0.36,
  'gpt-4o-mini-transcribe': 0.18,
  'gpt-transcribe': 0.27,
}

/** Groq účtuje každý požadavek nejméně za 10 s zvuku. */
export const GROQ_MIN_BILLED_SECONDS = 10

export function sttCostUsd(provider: 'groq' | 'openai', model: string, audioSeconds: number): number {
  const perHour = STT_PRICE_PER_HOUR[model] ?? 0
  if (!(audioSeconds > 0) || perHour === 0) return 0
  const billed = provider === 'groq' ? Math.max(GROQ_MIN_BILLED_SECONDS, audioSeconds) : audioSeconds
  return (billed / 3600) * perHour
}

/** USD za milion tokenů. Klíče jsou výchozí modely rolí, název modelu se píše jen v lib/ai/models.ts. */
export const LLM_PRICE_PER_MTOK: Readonly<Record<string, { input: number; output: number }>> = {
  [AI_MODEL_DEFAULTS.fast]: { input: 0.1, output: 0.5 },
  [AI_MODEL_DEFAULTS.smart]: { input: 2, output: 10 },
}

/**
 * Cena jednoho volání modelu. Neznámý model (přebitý proměnnou prostředí)
 * se počítá cenou nejdražšího známého — u přepisu raději 0, ale tady jde
 * o denní strop (G11), a ten musí platit i po výměně modelu.
 */
export function llmCostUsd(model: string, tokensIn: number, tokensOut: number): number {
  const known = LLM_PRICE_PER_MTOK[model]
  const price =
    known ?? Object.values(LLM_PRICE_PER_MTOK).reduce((a, b) => (b.output > a.output ? b : a))
  const tin = Math.max(0, tokensIn || 0)
  const tout = Math.max(0, tokensOut || 0)
  return (tin / 1e6) * price.input + (tout / 1e6) * price.output
}
