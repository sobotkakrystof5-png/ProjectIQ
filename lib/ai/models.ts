/**
 * Jediné místo s názvy modelů (AD14, R-084).
 *
 * Do AD14 byly čtyři modely ve čtyřech souborech a dva z nich natvrdo:
 * `app/api/ai-assistant/route.ts` jel na `claude-opus-4-6`, `lib/invoice-ai.ts`
 * na `claude-opus-5`. Přepis faktury je přitom obyčejná extrakce — haiku ji
 * zvládne za zlomek ceny. Když se model změní, mění se tady, ne na čtyřech
 * místech, a nikde jinde v repu už název modelu psát nemáme.
 *
 * Tři role místo seznamu modelů:
 * - `fast`   — věta → návrh akce, krátká odpověď asistenta
 * - `smart`  — nejednoznačná věta (`kind: 'none'`, nízká `confidence`), práce s pamětí
 * - `vision` — čtení dokumentu (PDF faktury)
 *
 * Název jde přebít proměnnou prostředí, aby se dal model vyměnit bez
 * nasazení. Prázdná nebo chybějící hodnota znamená výchozí z kódu.
 */

export type AiRole = 'fast' | 'smart' | 'vision'

/** Výchozí hodnoty. Mění se jen tady. */
export const AI_MODEL_DEFAULTS: Record<AiRole, string> = {
  fast: 'claude-haiku-5-5',
  smart: 'claude-sonnet-5-5',
  vision: 'claude-haiku-5-5',
}

/** Proměnná prostředí, která danou roli přebíjí. */
export const AI_MODEL_ENV: Record<AiRole, string> = {
  fast: 'ADMIN_AI_MODEL_FAST',
  smart: 'ADMIN_AI_MODEL_SMART',
  vision: 'ADMIN_AI_MODEL_VISION',
}

/** Model pro danou roli. Čte se při každém volání, ne při importu — testy i Vercel env tak platí hned. */
export function aiModel(role: AiRole): string {
  const fromEnv = process.env[AI_MODEL_ENV[role]]?.trim()
  return fromEnv || AI_MODEL_DEFAULTS[role]
}

/**
 * Bez klíče se na API vůbec nesahá. Stejná podmínka na všech místech, kde
 * se AI nabízí — tlačítko se pak ani neukáže místo toho, aby spadlo.
 */
export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN)
}
