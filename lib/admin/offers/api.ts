import 'server-only'
import Anthropic from '@anthropic-ai/sdk'

/**
 * Jediné místo, kudy navrhovač nabídek mluví s Managed Agents (R-147, N1).
 *
 * Proč adaptér: knihovna v repu (`@anthropic-ai/sdk` 0.105) zná starší tvar
 * API — nemá v typech strop ceny běhu (`budget`), cenu běhu (`usage.list_cost`),
 * nastavení webových nástrojů ani úsilí modelu. API je přijímá, takže se
 * objekty předávají jako data a přetypují se jen tady. Přechod na novou
 * hlavní verzi knihovny by byl samostatný krok s ověřením celého repa.
 *
 * Testy si podstrčí vlastní implementaci přes `setOfferApiForTests`.
 */

export type OfferSessionState = {
  status: 'rescheduling' | 'running' | 'idle' | 'terminated'
  costCents: number | null
  activeSeconds: number | null
}

/** Zjednodušená událost běhu: víc navrhovač nepotřebuje. */
export type OfferEvent =
  | { type: 'custom_tool_use'; name: string; input: unknown }
  | { type: 'idle'; stopReason: string }
  /** Krok, o kterém server nerozhodl a čeká na člověka (pravidlo `auto`). */
  | { type: 'tool_ask'; id: string }
  | { type: 'tool_confirmation'; toolUseId: string }
  | { type: 'error' }
  | { type: 'other' }

export type OfferApi = {
  createEnvironment(body: Record<string, unknown>): Promise<{ id: string }>
  updateEnvironment(id: string, body: Record<string, unknown>): Promise<{ id: string }>
  createAgent(body: Record<string, unknown>): Promise<{ id: string; version: number }>
  updateAgent(id: string, version: number, body: Record<string, unknown>): Promise<{ id: string; version: number }>
  startSession(input: {
    agentId: string
    agentVersion: number
    environmentId: string
    title: string
    metadata: Record<string, string>
    budgetCents: number
    message: string
  }): Promise<{ id: string }>
  getSession(id: string): Promise<OfferSessionState>
  listEvents(id: string): Promise<OfferEvent[]>
  /** Odmítne kroky, které čekají na schválení: u běhu nikdo nesedí (návod Managed Agents: bez člověka „deny"). */
  denyTools(sessionId: string, toolUseIds: string[]): Promise<void>
  interruptSession(id: string): Promise<void>
  deleteSession(id: string): Promise<void>
}

function centsFrom(usage: unknown): number | null {
  const amount = (usage as { list_cost?: { amount?: unknown; currency?: unknown } } | undefined)?.list_cost
  if (amount?.currency !== undefined && amount.currency !== 'USD') return null
  const n = typeof amount?.amount === 'string' ? Number(amount.amount) : NaN
  return Number.isInteger(n) && n >= 0 ? n : null
}

function secondsFrom(usage: unknown): number | null {
  const n = (usage as { active_seconds?: unknown } | undefined)?.active_seconds
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.round(n) : null
}

function sdkApi(): OfferApi {
  // Delší limit: založení prostředí a agentů je pomalejší než běžná zpráva.
  const client = new Anthropic({ timeout: 60_000, maxRetries: 1 })
  const beta = client.beta

  return {
    async createEnvironment(body) {
      const env = await beta.environments.create(body as unknown as Parameters<typeof beta.environments.create>[0])
      return { id: env.id }
    },
    async updateEnvironment(id, body) {
      const env = await beta.environments.update(id, body as unknown as Parameters<typeof beta.environments.update>[1])
      return { id: env.id }
    },
    async createAgent(body) {
      const agent = await beta.agents.create(body as unknown as Parameters<typeof beta.agents.create>[0])
      return { id: agent.id, version: agent.version }
    },
    async updateAgent(id, version, body) {
      const agent = await beta.agents.update(id, { ...body, version } as unknown as Parameters<typeof beta.agents.update>[1])
      return { id: agent.id, version: agent.version }
    },
    async startSession(input) {
      const params = {
        agent: { type: 'agent', id: input.agentId, version: input.agentVersion },
        environment_id: input.environmentId,
        title: input.title,
        metadata: input.metadata,
        // Tvrdý strop ceny běhu (API ho zná, typy knihovny 0.105 ještě ne).
        budget: { type: 'limit', max_list_cost: { amount: String(input.budgetCents), currency: 'USD' } },
      }
      const session = await beta.sessions.create(params as unknown as Parameters<typeof beta.sessions.create>[0])
      await beta.sessions.events.send(session.id, {
        events: [{ type: 'user.message', content: [{ type: 'text', text: input.message }] }],
      })
      return { id: session.id }
    },
    async getSession(id) {
      const session = await beta.sessions.retrieve(id)
      return { status: session.status, costCents: centsFrom(session.usage), activeSeconds: secondsFrom(session.usage) }
    },
    async listEvents(id) {
      const out: OfferEvent[] = []
      for await (const event of beta.sessions.events.list(id)) {
        if (event.type === 'agent.custom_tool_use') out.push({ type: 'custom_tool_use', name: event.name, input: event.input })
        else if (event.type === 'session.status_idle') out.push({ type: 'idle', stopReason: String((event.stop_reason as { type?: unknown }).type ?? '') })
        else if (event.type === 'agent.tool_use' && (event as { evaluated_permission?: unknown }).evaluated_permission === 'ask')
          out.push({ type: 'tool_ask', id: event.id })
        else if (event.type === 'user.tool_confirmation') out.push({ type: 'tool_confirmation', toolUseId: event.tool_use_id })
        else if (event.type === 'session.error') out.push({ type: 'error' })
        else out.push({ type: 'other' })
        if (out.length > 5_000) break
      }
      return out
    },
    async denyTools(sessionId, toolUseIds) {
      if (toolUseIds.length === 0) return
      const events = toolUseIds.map((id) => ({
        type: 'user.tool_confirmation',
        tool_use_id: id,
        result: 'deny',
        deny_message: 'Tenhle krok bez člověka neprovádíme. Pokračuj bez něj.',
      }))
      await beta.sessions.events.send(sessionId, { events } as unknown as Parameters<typeof beta.sessions.events.send>[1])
    },
    async interruptSession(id) {
      await beta.sessions.events.send(id, { events: [{ type: 'user.interrupt' }] })
    },
    async deleteSession(id) {
      await beta.sessions.delete(id)
    },
  }
}

let override: OfferApi | null = null

export function offerApi(): OfferApi {
  return override ?? sdkApi()
}

/** Jen pro testy. `null` vrátí skutečné API. */
export function setOfferApiForTests(next: OfferApi | null): void {
  override = next
}
