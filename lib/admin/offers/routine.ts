import 'server-only'
import { z } from 'zod'

/**
 * Spuštění cloudové úlohy Claude Code, která rozbor firmy zpracuje (R-149).
 *
 * Rozbor neběží na placeném API: běží jako naplánovaná úloha na claude.ai/code
 * v rámci předplatného Kryštofa. Tlačítko u kontaktu ji spustí hned přes
 * „API trigger" úlohy. Klíč `OFFER_RESEARCH_FIRE_TOKEN` umí jen tuhle jednu
 * úlohu spustit, nic přečíst ani změnit (dokumentace Anthropicu, 2026-11-26).
 *
 * Do úlohy jde jen id rozboru. Údaje o firmě si úloha vyzvedne sama přes
 * `/api/public/rozbory` s vlastním klíčem, který přidává cloudové prostředí.
 * Text v požadavku je pro úlohu nedůvěryhodný blok, proto v něm nic jiného není.
 *
 * Když spuštění selže, rozbor zůstane ve frontě a vyzvedne ho ranní průchod
 * téže úlohy podle rozvrhu.
 */

const ROUTINE_ID = /^trig_[A-Za-z0-9]{8,64}$/
const SESSION_URL = /^https:\/\/claude\.ai\/[A-Za-z0-9/_?=&.%-]{1,300}$/

const fireResponse = z.object({
  claude_code_session_id: z.string().regex(/^[A-Za-z0-9_-]{1,200}$/),
  claude_code_session_url: z.string().max(400).optional(),
})

export type FireOutcome =
  | { ok: true; sessionId: string; sessionUrl: string | null }
  | { ok: false; reason: 'not_configured' | 'rate_limited' | 'failed' }

export type FireRoutine = (researchId: string) => Promise<FireOutcome>

function config(): { routineId: string; token: string } | null {
  const routineId = process.env.OFFER_RESEARCH_ROUTINE_ID?.trim() ?? ''
  const token = process.env.OFFER_RESEARCH_FIRE_TOKEN?.trim() ?? ''
  if (!ROUTINE_ID.test(routineId) || token === '') return null
  return { routineId, token }
}

/** Jde úlohu spustit hned? Bez toho rozbor počká na ranní průchod. */
export function routineConfigured(): boolean {
  return config() !== null
}

/** Spustí úlohu pro jeden rozbor. Nikdy nevyhazuje: selhání vrací jako výsledek. */
export async function fireRoutine(researchId: string, fetchImpl: typeof fetch = fetch): Promise<FireOutcome> {
  const cfg = config()
  if (cfg === null) return { ok: false, reason: 'not_configured' }
  try {
    const res = await fetchImpl(`https://api.anthropic.com/v1/claude_code/routines/${cfg.routineId}/fire`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${cfg.token}`,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'experimental-cc-routine-2026-04-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ text: JSON.stringify({ rozbor: researchId }) }),
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    })
    if (res.status === 429) return { ok: false, reason: 'rate_limited' }
    if (!res.ok) {
      // Do logu jen stav, nikdy tělo ani klíč.
      console.error('[navrhovac] spuštění úlohy selhalo:', res.status)
      return { ok: false, reason: 'failed' }
    }
    const parsed = fireResponse.safeParse(await res.json().catch(() => null))
    if (!parsed.success) {
      console.error('[navrhovac] spuštění úlohy vrátilo nečekanou odpověď')
      return { ok: false, reason: 'failed' }
    }
    const url = parsed.data.claude_code_session_url
    return {
      ok: true,
      sessionId: parsed.data.claude_code_session_id,
      sessionUrl: url !== undefined && SESSION_URL.test(url) ? url : null,
    }
  } catch (err) {
    console.error('[navrhovac] spuštění úlohy selhalo:', err instanceof Error ? err.name : 'unknown')
    return { ok: false, reason: 'failed' }
  }
}
