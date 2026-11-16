import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { aiModel, isAiConfigured } from '@/lib/ai/models'
import { PROPOSE_PROMPT, proposeCatalogue } from '@/lib/ai/prompts'
import { loadAiContext, type ContextRef } from '@/lib/ai/context'
import { stripMarkers } from '@/lib/ai/markers'
import { CONFIDENCE_FLOOR, type Suggestion } from '@/lib/ai/suggestion-schema'
import { coerceLookups, coercePlan, type Lookup } from '@/lib/ai/plan-format'
import { runLookups } from '@/lib/admin/assistant-lookups'
import { redactSensitive } from '@/lib/project-activity'
import { getPragueTodayISO } from '@/lib/prague-time'

/**
 * Věta → typovaný plán akcí (AD14, od R-111 víc akcí naráz).
 *
 * JSON podle popisu v promptu, **ne nástroje**: model nemá konat, má vrátit
 * plán, který provede server podle `lib/ai/action-policy.ts`. Strukturovaný
 * výstup se schématem API odmítlo jako moc složité, takže přísnou kontrolu
 * dělá `lib/ai/plan-format.ts` — odpověď, která neprojde, se nepoužije.
 *
 * Dvě kola, ne víc: `fast` (haiku) zkusí větu rozluštit a jen když si není
 * jistý nebo nic nenavrhne, ptá se `smart` (sonnet). Druhé kolo se tak platí
 * jen u vět, na kterých levný model opravdu selhal.
 *
 * Nikdy nevyhazuje — vrací `error` s českou hláškou.
 */

export type ProposeResult =
  | {
      suggestion: Suggestion
      model: string
      tokensIn: number | null
      tokensOut: number | null
      /** Byl v kontextu text, který mohl napsat někdo cizí? Pak se nic neprovede samo. */
      untrustedContext: boolean
    }
  | { error: string }

/** Strop odpovědi. Plán je pár polí na akci; osm akcí se do toho vejde s rezervou. */
const MAX_TOKENS = 3000

const WEEKDAYS = ['neděle', 'pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota'] as const

/** „Dnes je čtvrtek 2026-11-19." — bez dne v týdnu model „ve čtvrtek" počítá špatně. */
export function todayLine(todayIso: string): string {
  const weekday = WEEKDAYS[new Date(`${todayIso}T12:00:00Z`).getUTCDay()]
  return `Dnes je ${weekday} ${todayIso}.`
}

type Round = { suggestion: Suggestion | null; lookups: Lookup[]; tokensIn: number; tokensOut: number }

/**
 * Pokyn pro druhé kolo: data jsou dohledaná, další dotazy se nežádají.
 * Bez něj by model mohl chtít data znovu a kola by se točila.
 */
const DATA_ROUND_NOTE =
  'V <data> jsou výsledky dotazů, o které sis řekl. Odpověz nebo sestav plán z nich; "lookups" nech prázdné. Co v datech není, nevymýšlej.'

async function callModel(model: string, text: string, context: string, data: string): Promise<Round> {
  const client = new Anthropic({ timeout: 30_000, maxRetries: 1 })

  // Stabilní prefix = systémový prompt + katalog stavů a akcí. Mění se jen
  // s nasazením, takže se dá číst z cache; věta uživatele, dnešní datum
  // a čerstvý kontext jdou až za ním, ve zprávě. Kontrola:
  // `usage.cache_read_input_tokens` má být po druhém dotazu nenulové.
  const system: Anthropic.TextBlockParam[] = [
    { type: 'text', text: PROPOSE_PROMPT },
    { type: 'text', text: proposeCatalogue(), cache_control: { type: 'ephemeral' } },
  ]

  const response = await client.messages.create({
    model,
    max_tokens: MAX_TOKENS,
    system,
    // Bez `format`: přísné schéma API odmítlo jako moc složité (plan-format.ts).
    output_config: { effort: 'low' },
    messages: [
      {
        role: 'user',
        content: [
          todayLine(getPragueTodayISO()),
          context,
          data,
          data ? DATA_ROUND_NOTE : '',
          '',
          `<veta>\n${text}\n</veta>`,
        ]
          .filter(Boolean)
          .join('\n'),
      },
    ],
  })

  // Odmítnutí nebo useknutá odpověď nejsou plán — `coercePlan` by z nich nic nesestavil.
  const output =
    response.stop_reason === 'end_turn'
      ? response.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('')
      : ''

  return {
    suggestion: output ? coercePlan(output) : null,
    // Ve druhém kole se další dotazy nepouštějí — data už jsou.
    lookups: output && !data ? coerceLookups(output) : [],
    tokensIn: response.usage?.input_tokens ?? 0,
    tokensOut: response.usage?.output_tokens ?? 0,
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
  // Kontext zakázky i kontaktu nese texty, které mohl napsat klient (popis
  // poptávky z webu, poznámky, požadavky z portálu). Rozlišovat je po
  // sloupcích by bylo křehké — kdo má kontext, nepouští nic samo.
  const untrustedContext = context !== ''

  try {
    let tokensIn = 0
    let tokensOut = 0
    let data = ''

    /**
     * Jedno „kolo" modelu. Když si model řekne o data (A4), provedou se
     * dotazy (jen čtení) a model dostane druhou šanci už s nimi.
     */
    const ask = async (model: string): Promise<Round> => {
      let round = await callModel(model, text, context, data)
      tokensIn += round.tokensIn
      tokensOut += round.tokensOut
      if (!data && round.lookups.length > 0) {
        data = await runLookups(round.lookups)
        round = await callModel(model, text, context, data)
        tokensIn += round.tokensIn
        tokensOut += round.tokensOut
      }
      return round
    }

    const fast = aiModel('fast')
    let model = fast
    let out = await ask(fast)

    // Prázdný plán s jistou odpovědí je zodpovězený dotaz — silnější model by
    // řekl totéž dráž. Druhé kolo jen při nejistotě nebo nepoužitelné odpovědi.
    const needsSmart = !out.suggestion || out.suggestion.confidence < CONFIDENCE_FLOOR
    const smart = aiModel('smart')
    if (needsSmart && smart !== fast) {
      const second = await ask(smart)
      if (second.suggestion) {
        model = smart
        out = second
      }
    }

    if (!out.suggestion) return { error: 'Z věty se nepodařilo udělat plán. Zkuste to říct jinak.' }
    return {
      suggestion: out.suggestion,
      model,
      tokensIn,
      tokensOut,
      // Data z databáze nesou jména a texty z webových formulářů — plán nad
      // nimi se neprovede sám, stejně jako plán nad kontextem záznamu.
      untrustedContext: untrustedContext || data !== '',
    }
  } catch (err) {
    console.error('[ai-propose] plán selhal:', err instanceof Error ? err.name : 'unknown')
    if (err instanceof Anthropic.RateLimitError) {
      return { error: 'AI je momentálně přetížená — zkuste to za chvíli.' }
    }
    if (err instanceof Anthropic.AuthenticationError) {
      return { error: 'Asistent není správně nakonfigurovaný.' }
    }
    return { error: 'Plán se nepodařilo vytvořit. Zkuste to znovu.' }
  }
}
