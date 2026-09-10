import { z } from 'zod'

// Kontrakt s externím vizeon-lead-agent (Python/FastAPI). `client` je tvrzení
// od člověka z formuláře, `analysis` je odhad agenta (LLM scoring) — schéma
// je záměrně drží odděleně, ať se to nesmíchá při ukládání.
//
// Zod ve výchozím nastavení (bez .strict()) neznámé klíče tiše zahodí místo
// pádu na chybě — to je přesně chování, které chceme: až agentí payload
// povyroste (vyšší `version`), starší Zakaziq nesmí přestat fungovat.

const clientSchema = z.object({
  name: z.string().min(1, 'client.name je povinné'),
  email: z.string().email({ message: 'client.email musí být platný e-mail' }),
  service: z.string().min(1, 'client.service je povinné'),
  phone: z.string().nullish(),
  company: z.string().nullish(),
  budget: z.string().nullish(),
  deadline: z.string().nullish(),
  message: z.string().nullish(),
})

const communicationStrategySchema = z.object({
  tone: z.string(),
  style: z.string(),
  focus: z.array(z.string()),
  avoid: z.array(z.string()),
})

const analysisSchema = z.object({
  lead_score: z.number().int().min(0).max(100),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  score_breakdown: z.record(z.string(), z.number()),
  company_type: z.string(),
  industry: z.string(),
  digital_maturity: z.string(),
  project_complexity: z.string(),
  clarity_of_request: z.string(),
  summary: z.string(),
  communication_strategy: communicationStrategySchema,
})

export const agentLeadPayloadSchema = z.object({
  source: z.string().min(1),
  version: z.number().int(),
  section: z.string().min(1),
  lead_id: z.string().min(1),
  received_at: z.string().refine(s => !isNaN(Date.parse(s)), { message: 'received_at musí být platné datum' }),
  client: clientSchema,
  analysis: analysisSchema,
})

export type AgentLeadPayload = z.infer<typeof agentLeadPayloadSchema>
