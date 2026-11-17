import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { aiModel, isAiConfigured } from '@/lib/ai/models'
import { PROPOSE_PROMPT, proposeCatalogue } from '@/lib/ai/prompts'
import { loadAiContext, type ContextRef } from '@/lib/ai/context'
import { stripMarkers } from '@/lib/ai/markers'
import { type Suggestion } from '@/lib/ai/suggestion-schema'
import { coerceLookups, coercePlan, type Lookup } from '@/lib/ai/plan-format'
import { runLookups } from '@/lib/admin/assistant-lookups'
import { redactSensitive } from '@/lib/project-activity'
import { loadWorkspaceSnapshot } from '@/lib/ai/workspace-snapshot'
import { pragueNow, timeContext } from '@/lib/ai/time-context'
import { HISTORY_MAX, TEXT_MAX } from '@/lib/ai/assistant-limits'

/**
 * Věta → typovaný plán akcí (AD14, od R-111 víc akcí naráz).
 *
 * JSON podle popisu v promptu, **ne nástroje**: model nemá konat, má vrátit
 * plán, který provede server podle `lib/ai/action-policy.ts`. Strukturovaný
 * výstup se schématem API odmítlo jako moc složité, takže přísnou kontrolu
 * dělá `lib/ai/plan-format.ts` — odpověď, která neprojde, se nepoužije.
 *
 * Od R-113 je to rozhovor: model dostane historii, přehled firmy a ke
 * každé větě se rozhoduje znovu. Hlavní model je `smart` (sonnet), `fast`
 * jen záchrana, když odpověď nejde přečíst.
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

/** Jedna replika rozhovoru (R-113). Odpověď asistenta je shrnutí kola ze serveru (`turnSummary`). */
export type ChatTurn = { role: 'user' | 'assistant'; content: string }

/**
 * Historie z prohlížeče → zprávy pro model. Prohlížeč patří adminovi, ale
 * text stejně projde zakrytím a ořezem: do okénka se dá vložit cokoli.
 * Zprávy se musí střídat a začínat uživatelem, jinak je API odmítne —
 * stejné role za sebou se slijí, úvodní odpověď asistenta se zahodí.
 */
export function historyMessages(history: ChatTurn[] | undefined): Anthropic.MessageParam[] {
  const out: { role: 'user' | 'assistant'; content: string }[] = []
  for (const turn of (history ?? []).slice(-HISTORY_MAX)) {
    const content = stripMarkers(redactSensitive(turn.content.slice(0, TEXT_MAX)).text).trim()
    if (!content) continue
    if (out.length === 0 && turn.role !== 'user') continue
    const last = out[out.length - 1]
    if (last && last.role === turn.role) last.content = `${last.content}\n\n${content}`
    else out.push({ role: turn.role, content })
  }
  // Poslední replika historie musí být od asistenta — za ní jde nová věta.
  if (out.length > 0 && out[out.length - 1].role === 'user') out.pop()
  return out
}

async function callModel(
  model: string,
  text: string,
  blocks: { snapshot: string; context: string; data: string },
  history: Anthropic.MessageParam[],
): Promise<Round> {
  const client = new Anthropic({ timeout: 45_000, maxRetries: 1 })
  const { snapshot, context, data } = blocks

  // Stabilní prefix = systémový prompt + katalog stavů a akcí. Mění se jen
  // s nasazením, takže se dá číst z cache; přehled firmy, věta, dnešní datum
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
      ...history,
      {
        role: 'user',
        content: [
          timeContext(pragueNow()),
          snapshot,
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
  history?: ChatTurn[]
}): Promise<ProposeResult> {
  if (!isAiConfigured()) return { error: 'Asistent není nakonfigurovaný.' }

  // Zakrytí dřív, než věta odejde k modelu i než se uloží do `ai_suggestions`.
  const text = stripMarkers(redactSensitive(input.text).text).trim()
  if (!text) return { error: 'Napište, co se má stát.' }

  const [context, snapshot] = await Promise.all([
    loadAiContext(input.contextRef ?? null).then((c) => c.text),
    // Přehled firmy jde ke každé větě (R-113). Jen strukturované údaje bez
    // volného textu — samostatné provádění nevypíná (workspace-snapshot.ts).
    loadWorkspaceSnapshot(),
  ])
  const history = historyMessages(input.history)
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
      let round = await callModel(model, text, { snapshot, context, data }, history)
      tokensIn += round.tokensIn
      tokensOut += round.tokensOut
      if (!data && round.lookups.length > 0) {
        data = await runLookups(round.lookups)
        round = await callModel(model, text, { snapshot, context, data }, history)
        tokensIn += round.tokensIn
        tokensOut += round.tokensOut
      }
      return round
    }

    // Rozhovor, doptávání a úpravy podle id potřebují víc úsudku než
    // jednorázová věta — hlavní je `smart` (R-113). `fast` je jen záchrana,
    // když silnější model odpověď nesestaví.
    const smart = aiModel('smart')
    let model = smart
    let out = await ask(smart)
    const fast = aiModel('fast')
    if (!out.suggestion && fast !== smart) {
      const second = await ask(fast)
      if (second.suggestion) {
        model = fast
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
