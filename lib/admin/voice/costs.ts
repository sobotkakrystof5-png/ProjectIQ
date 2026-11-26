/**
 * ZakazIQ Voice (R-148): ceny na jednom místě (plán, oddíl 12).
 *
 * Ověřeno 2026-11-25: Groq console.groq.com/docs/speech-to-text (nejkratší
 * účtovaná délka 10 s), OpenAI developers.openai.com/api/docs/pricing
 * („Estimated cost" za minutu). Slouží k odhadu `voice_dictations.cost_usd`
 * a dennímu stropu (D-V11). Poskytovatelé účtují v USD, měny se nesčítají.
 * Cenu čištění (Claude) doplní VO07.
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
