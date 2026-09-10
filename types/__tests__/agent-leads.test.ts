import { describe, it, expect } from 'vitest'
import { agentLeadPayloadSchema } from '../agent-leads'

function validPayload() {
  return {
    source: 'vizeon-lead-agent',
    version: 1,
    section: 'vizeon',
    lead_id: 'lead_9f2c1b7a3d4e5f60',
    received_at: '2026-09-09T20:30:00+00:00',
    client: {
      name: 'Jan Novák',
      email: 'jan@novakelektro.cz',
      phone: '+420111222333',
      company: 'Novák Elektro',
      service: 'eshop',
      budget: '150000-250000',
      deadline: '2 months',
      message: 'Máme e-shop na Shoptetu, potřebujeme vlastní řešení se skladem.',
    },
    analysis: {
      lead_score: 88,
      priority: 'HIGH',
      score_breakdown: { budget: 25, urgency: 15 },
      company_type: 'sme',
      industry: 'ecommerce',
      digital_maturity: 'high',
      project_complexity: 'medium',
      clarity_of_request: 'high',
      summary: 'Zavedený e-shop hledá redesign se skladem.',
      communication_strategy: {
        tone: 'věcný a konkrétní',
        style: 'krátké odstavce a termíny',
        focus: ['napojení na sklad'],
        avoid: ['marketingové fráze'],
      },
    },
  }
}

describe('agentLeadPayloadSchema', () => {
  it('accepts the full payload from the contract', () => {
    expect(agentLeadPayloadSchema.safeParse(validPayload()).success).toBe(true)
  })

  it('accepts optional client fields as null', () => {
    const payload = validPayload()
    payload.client = { ...payload.client, phone: null, company: null, budget: null, deadline: null, message: null } as any
    expect(agentLeadPayloadSchema.safeParse(payload).success).toBe(true)
  })

  it('rejects a missing required client field', () => {
    const payload = validPayload() as any
    delete payload.client.email
    expect(agentLeadPayloadSchema.safeParse(payload).success).toBe(false)
  })

  it('rejects an invalid client email', () => {
    const payload = validPayload()
    payload.client.email = 'not-an-email'
    expect(agentLeadPayloadSchema.safeParse(payload).success).toBe(false)
  })

  it('rejects lead_score outside 0-100', () => {
    const payload = validPayload()
    payload.analysis.lead_score = 101
    expect(agentLeadPayloadSchema.safeParse(payload).success).toBe(false)
  })

  it('rejects a priority outside LOW/MEDIUM/HIGH', () => {
    const payload = validPayload() as any
    payload.analysis.priority = 'URGENT'
    expect(agentLeadPayloadSchema.safeParse(payload).success).toBe(false)
  })

  it('ignores unknown top-level fields instead of failing', () => {
    const payload = { ...validPayload(), future_field: 'nová data z vyšší verze agenta' }
    const result = agentLeadPayloadSchema.safeParse(payload)
    expect(result.success).toBe(true)
    if (result.success) {
      expect((result.data as any).future_field).toBeUndefined()
    }
  })
})
